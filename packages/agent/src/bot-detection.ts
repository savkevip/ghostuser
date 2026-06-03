import type { Page } from "playwright";

export interface BotDetectionResult {
  blocked: boolean;
  reason?: string;
}

const FRIENDLY_HINT =
  "GhostUser doesn't support sites behind bot protection — point it at your dev server instead (e.g. http://localhost:3000), where you're testing your own work anyway.";

export async function detectBotProtection(
  page: Page,
): Promise<BotDetectionResult> {
  try {
    const url = page.url();
    const title = (await page.title()).toLowerCase();

    if (
      title.includes("just a moment") ||
      title.includes("attention required") ||
      url.includes("cf-browser-verification") ||
      url.includes("__cf_chl_")
    ) {
      return {
        blocked: true,
        reason: `Cloudflare bot protection detected. ${FRIENDLY_HINT}`,
      };
    }

    if (title.includes("access denied") || title.includes("blocked")) {
      return {
        blocked: true,
        reason: `Access denied / blocked page detected. ${FRIENDLY_HINT}`,
      };
    }

    const html = (await page.content()).toLowerCase();

    if (
      html.includes("cf-challenge-running") ||
      html.includes("cf_chl_opt") ||
      html.includes("checking your browser")
    ) {
      return {
        blocked: true,
        reason: `Cloudflare challenge in progress. ${FRIENDLY_HINT}`,
      };
    }

    // Visible reCAPTCHA / hCaptcha
    const captchaSelectors = [
      'iframe[src*="recaptcha"]',
      'iframe[src*="hcaptcha"]',
      'iframe[src*="turnstile"]',
      ".g-recaptcha",
      ".h-captcha",
      ".cf-turnstile",
    ];
    for (const selector of captchaSelectors) {
      const visible = await page
        .locator(selector)
        .first()
        .isVisible({ timeout: 100 })
        .catch(() => false);
      if (visible) {
        return {
          blocked: true,
          reason: `Captcha detected (${selector}). ${FRIENDLY_HINT}`,
        };
      }
    }

    return { blocked: false };
  } catch {
    // If detection itself fails (page closed, etc.), don't claim blocked
    return { blocked: false };
  }
}
