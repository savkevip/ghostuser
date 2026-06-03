import { chromium, type Browser, type Page } from "playwright";
import { getPersonaAsync } from "ghostuser-core";
import { detectBotProtection } from "./bot-detection.js";
import { getInteractiveElements } from "./dom.js";
import { decideNextAction } from "./decide.js";
import { diagnoseRun } from "./diagnose.js";
import type {
  AgentOptions,
  AgentResult,
  AgentStep,
  TechnicalIssue,
} from "./types.js";

interface RunUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  models: Set<string>;
}

/** Track active browsers so we can close them on SIGINT/SIGTERM. */
const activeBrowsers = new Set<Browser>();
let signalHandlersRegistered = false;

function registerSignalHandlers() {
  if (signalHandlersRegistered) return;
  signalHandlersRegistered = true;
  const cleanup = async (signal: NodeJS.Signals) => {
    process.stderr.write(
      `\n[ghostuser] received ${signal}, closing ${activeBrowsers.size} browser(s)...\n`,
    );
    await Promise.allSettled(
      Array.from(activeBrowsers).map((b) => b.close()),
    );
    process.exit(130);
  };
  process.on("SIGINT", () => void cleanup("SIGINT"));
  process.on("SIGTERM", () => void cleanup("SIGTERM"));
}

export async function runAgent(options: AgentOptions): Promise<AgentResult> {
  registerSignalHandlers();

  const t0 = Date.now();
  const maxSteps = options.maxSteps ?? 15;

  const browser: Browser = await chromium.launch({
    headless: options.headless ?? false,
  });
  activeBrowsers.add(browser);

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page: Page = await context.newPage();

  const steps: AgentStep[] = [];
  const technicalIssues: TechnicalIssue[] = [];
  let currentStep = 0;

  const totalUsage: RunUsage = {
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    models: new Set<string>(),
  };

  // Hook into browser events to catch technical issues
  page.on("pageerror", (err) => {
    technicalIssues.push({
      type: "page_error",
      message: err.message.split("\n")[0].slice(0, 200),
      url: page.url(),
      atStep: currentStep,
    });
  });

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text().slice(0, 200);
      if (
        text.includes("favicon") ||
        text.includes("DevTools") ||
        text.includes("third-party")
      ) {
        return;
      }
      technicalIssues.push({
        type: "console_error",
        message: text,
        url: page.url(),
        atStep: currentStep,
      });
    }
  });

  page.on("requestfailed", (request) => {
    const failure = request.failure();
    if (!failure) return;
    const url = request.url();
    if (
      failure.errorText.includes("ERR_ABORTED") ||
      failure.errorText.includes("net::ERR_CANCELED")
    ) {
      return;
    }
    technicalIssues.push({
      type: "failed_request",
      message: `${request.method()} ${url} — ${failure.errorText}`,
      url,
      atStep: currentStep,
    });
  });

  page.on("response", (response) => {
    const status = response.status();
    if (status >= 400 && status !== 404) {
      technicalIssues.push({
        type: "http_error",
        message: `${status} ${response.statusText()}`,
        url: response.url(),
        status,
        atStep: currentStep,
      });
    } else if (status === 404) {
      const isDocument =
        response.request().resourceType() === "document";
      if (isDocument) {
        technicalIssues.push({
          type: "http_error",
          message: `404 Not Found (page)`,
          url: response.url(),
          status: 404,
          atStep: currentStep,
        });
      }
    }
  });

  const persona = await getPersonaAsync(options.personaId);

  const closeBrowser = async () => {
    activeBrowsers.delete(browser);
    await browser.close().catch(() => {});
  };

  const finish = async (
    result: Pick<AgentResult, "verdict" | "reason"> & { steps: AgentStep[] },
  ): Promise<AgentResult> => {
    let diagnosis: Awaited<ReturnType<typeof diagnoseRun>>;
    try {
      diagnosis = await diagnoseRun({
        steps: result.steps,
        technicalIssues,
        goal: options.goal,
        persona,
        verdict: result.verdict,
        reason: result.reason,
        apiKey: options.apiKey,
        model: options.diagnoseModel ?? options.model,
      });
    } catch (e) {
      const model = options.diagnoseModel ?? options.model ?? "claude-sonnet-4-6";
      const usage = { inputTokens: 0, outputTokens: 0 };
      diagnosis = {
        summary: `Diagnosis failed: ${(e as Error).message}`,
        uxBugs: [],
        qaBugs: [],
        usage,
        cost: {
          inputUsd: 0,
          outputUsd: 0,
          totalUsd: 0,
          model,
          pricingSource: "known",
        },
        model,
      };
    }

    totalUsage.inputTokens += diagnosis.usage.inputTokens;
    totalUsage.outputTokens += diagnosis.usage.outputTokens;
    totalUsage.costUsd += diagnosis.cost.totalUsd;
    totalUsage.models.add(diagnosis.model);

    await closeBrowser();

    return {
      verdict: result.verdict,
      reason: result.reason,
      steps: result.steps,
      uxBugs: diagnosis.uxBugs,
      qaBugs: diagnosis.qaBugs,
      technicalIssues,
      summary: diagnosis.summary,
      durationMs: Date.now() - t0,
      personaId: options.personaId,
      goal: options.goal,
      url: options.url,
      usage: {
        inputTokens: totalUsage.inputTokens,
        outputTokens: totalUsage.outputTokens,
      },
      costUsd: totalUsage.costUsd,
      modelsUsed: Array.from(totalUsage.models),
    };
  };

  try {
    await page.goto(options.url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
  } catch (e) {
    return finish({
      verdict: "failed",
      reason: `Could not load ${options.url}: ${(e as Error).message}`,
      steps,
    });
  }

  try {
    for (let stepNum = 1; stepNum <= maxSteps; stepNum++) {
      currentStep = stepNum;

      const bot = await detectBotProtection(page);
      if (bot.blocked) {
        return finish({
          verdict: "blocked",
          reason: bot.reason,
          steps,
        });
      }

      await page
        .waitForLoadState("domcontentloaded", { timeout: 3000 })
        .catch(() => {});

      let screenshot: Buffer;
      try {
        screenshot = await page.screenshot({ fullPage: false, type: "png" });
      } catch (e) {
        return finish({
          verdict: "failed",
          reason: `Screenshot failed: ${(e as Error).message}`,
          steps,
        });
      }

      const elements = await getInteractiveElements(page).catch(() => []);
      const currentUrl = page.url();

      const decision = await decideNextAction({
        screenshotBase64: screenshot.toString("base64"),
        elements,
        personaId: options.personaId,
        goal: options.goal,
        history: steps,
        apiKey: options.apiKey,
        model: options.model,
      });
      totalUsage.inputTokens += decision.usage.inputTokens;
      totalUsage.outputTokens += decision.usage.outputTokens;
      totalUsage.costUsd += decision.cost.totalUsd;
      totalUsage.models.add(decision.model);
      const action = decision.action;

      const step: AgentStep = { stepNum, url: currentUrl, action };
      steps.push(step);
      options.onStep?.(step);

      if (action.type === "done") {
        return finish({ verdict: "passed", steps });
      }
      if (action.type === "give_up") {
        return finish({
          verdict: "failed",
          reason: action.reason ?? "persona gave up",
          steps,
        });
      }

      let extraSettleMs = 0;
      try {
        if (action.type === "click" && action.selector) {
          await page
            .locator(action.selector)
            .first()
            .click({ timeout: 5000 });
          // Trust the LLM's semantic intent — no string-matching heuristic.
          if (decision.isStateChange) {
            extraSettleMs = 2000;
          }
        } else if (action.type === "type" && action.selector && action.text) {
          await page
            .locator(action.selector)
            .first()
            .fill(action.text, { timeout: 5000 });
        } else if (action.type === "scroll") {
          await page.mouse.wheel(0, 600);
        } else if (action.type === "wait") {
          await page.waitForTimeout(1800);
        }
      } catch (e) {
        steps.push({
          stepNum,
          url: page.url(),
          action: {
            type: "wait",
            narration: `(internal: ${action.type} failed — ${(e as Error).message.split("\n")[0]})`,
          },
        });
      }

      await page.waitForTimeout(800 + extraSettleMs);
    }

    return finish({
      verdict: "max_steps",
      reason: `Reached max steps (${maxSteps}) without completing or giving up`,
      steps,
    });
  } catch (e) {
    // Unhandled error somewhere in the loop — make sure we close the browser.
    await closeBrowser();
    throw e;
  }
}
