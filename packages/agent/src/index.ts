export { runAgent } from "./agent.js";
export { init, resolveApiKey } from "ghostuser-core";
export type { InitOptions } from "ghostuser-core";
export { detectBotProtection } from "./bot-detection.js";
export { getInteractiveElements } from "./dom.js";
export { diagnoseRun } from "./diagnose.js";
export type {
  AgentOptions,
  AgentResult,
  AgentStep,
  AgentAction,
  ActionType,
  Verdict,
  UxBug,
  QaBug,
  TechnicalIssue,
  TechnicalIssueType,
  Severity,
} from "./types.js";
export type { InteractiveElement } from "./dom.js";
export type { BotDetectionResult } from "./bot-detection.js";
export type { DiagnoseInput, DiagnoseOutput } from "./diagnose.js";
