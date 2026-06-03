export type ActionType =
  | "click"
  | "type"
  | "scroll"
  | "wait"
  | "done"
  | "give_up";

export interface AgentAction {
  type: ActionType;
  narration: string;
  selector?: string;
  text?: string;
  reason?: string;
}

export interface AgentStep {
  stepNum: number;
  url: string;
  action: AgentAction;
}

export type Verdict = "passed" | "failed" | "blocked" | "max_steps";

export type Severity = "low" | "medium" | "high";

export interface UxBug {
  severity: Severity;
  description: string;
}

export type TechnicalIssueType =
  | "console_error"
  | "page_error"
  | "failed_request"
  | "http_error";

export interface TechnicalIssue {
  type: TechnicalIssueType;
  message: string;
  url?: string;
  status?: number;
  atStep?: number;
}

export interface QaBug {
  severity: Severity;
  description: string;
  evidence?: string;
}

export interface AgentResult {
  verdict: Verdict;
  reason?: string;
  steps: AgentStep[];
  uxBugs: UxBug[];
  qaBugs: QaBug[];
  technicalIssues: TechnicalIssue[];
  summary?: string;
  durationMs: number;
  personaId: string;
  goal: string;
  url: string;
  usage: { inputTokens: number; outputTokens: number };
  costUsd: number;
  modelsUsed: string[];
}

export interface AgentOptions {
  url: string;
  personaId: string;
  goal: string;
  maxSteps?: number;
  headless?: boolean;
  apiKey?: string;
  model?: string;
  /** Optional cheaper model for the end-of-run diagnosis. Defaults to same as model. */
  diagnoseModel?: string;
  onStep?: (step: AgentStep) => void;
}
