/** Phase 2 execution state. Application messages remain host-owned. */
export type EngineCapabilities = {
  imageInput: boolean;
  nativeTools: boolean;
  recovery: boolean;
  steering: boolean;
  browser: boolean;
  managedPreview: boolean;
};
export type EngineSession = {
  sessionId: string;
  engine: "codex";
  version: string;
  workspace: string;
  providerId: string;
  modelId: string;
  nativeHandle?: string;
  capabilities: EngineCapabilities;
};
export type EngineOutcome = "completed" | "interrupted" | "failed";
export type EngineProgressPhase = "preparing" | "recovering" | "waiting-model" | "reasoning" | "answering" | "tool" | "waiting-approval" | "waiting-input" | "waiting-subagents" | "retrying" | "compacting";
export type EnginePhaseSpan = {
  phase: EngineProgressPhase;
  startedAt: number;
  completedAt?: number;
  detail?: string;
};
export type EngineItem = {
  id: string;
  nativeId: string;
  kind: "assistant" | "reasoning" | "tool" | "approval" | "artifact";
  label: string;
  status: "running" | EngineOutcome;
  text: string;
  args?: unknown;
  result?: unknown;
  /** Native handle and observations only; a yielded command is not an exited process. */
  command?: { processId: string; yieldedAt?: number; exitedAt?: number; exitCode?: number };
  startedAt: number;
  completedAt?: number;
};
export type EngineTurn = {
  id: string;
  runId: string;
  nativeTurnId?: string;
  /** Earlier native segments within this same host run; start time never resets. */
  nativeSegments?: Array<{ nativeTurnId: string; outcome: "completed" | "interrupted"; completedAt: number }>;
  startedAt: number;
  completedAt?: number;
  outcome?: EngineOutcome;
  error?: string;
  /** Product timing metadata, bounded independently of streamed output. */
  progressPhase?: EngineProgressPhase;
  timeline?: EnginePhaseSpan[];
  omittedSpans?: number;
  /** Latest native request occupancy, never cumulative thread expenditure. */
  contextUsage?: { usage: import("./types.js").MessageUsage; contextWindow?: number };
  phase: "preparing" | "recovering" | "waiting-model" | "running" | "waiting-approval" | "terminal";
};
export type EngineSnapshot = {
  schema: 1;
  session: EngineSession;
  sequence: number;
  turn?: EngineTurn;
  items: EngineItem[];
};
/** Events from a previous run cannot mutate a current snapshot. */
export type EngineEvent = {
  sessionId: string;
  runId: string;
  sequence: number;
  ts: number;
} & (
  | { type: "phase"; phase: EngineTurn["phase"]; nativeTurnId?: string; progressPhase?: EngineProgressPhase; detail?: string }
  | { type: "native-segment"; expectedNativeTurnId: string; outcome: "completed" | "interrupted" }
  | { type: "item"; item: EngineItem }
  | { type: "context-usage"; contextUsage: NonNullable<EngineTurn["contextUsage"]> }
  | { type: "terminal"; outcome: EngineOutcome; error?: string }
);
export interface EngineAdapter {
  start(input: { turnId: string; text: string; acceptedAt?: number; thinkingLevel?: import("./types.js").ThinkingLevel; images?: Array<{ mimeType: string; data: string }> }): Promise<{ accepted: boolean; turnId: string }>;
  interrupt(): Promise<void>;
  steer(input: { expectedTurnId: string; text: string; messageId?: string }): Promise<import("./types.js").SteerOutcome>;
  snapshot(): EngineSnapshot;
  recover(): Promise<EngineSnapshot>;
  shutdown(): Promise<void>;
}
