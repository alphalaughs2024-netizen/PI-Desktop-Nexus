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
export type EngineItem = {
  id: string;
  nativeId: string;
  kind: "assistant" | "reasoning" | "tool" | "approval" | "artifact";
  label: string;
  status: "running" | EngineOutcome;
  text: string;
  args?: unknown;
  result?: unknown;
  startedAt: number;
  completedAt?: number;
};
export type EngineTurn = {
  id: string;
  runId: string;
  nativeTurnId?: string;
  startedAt: number;
  completedAt?: number;
  outcome?: EngineOutcome;
  error?: string;
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
  | { type: "phase"; phase: EngineTurn["phase"]; nativeTurnId?: string }
  | { type: "item"; item: EngineItem }
  | { type: "terminal"; outcome: EngineOutcome; error?: string }
);
export interface EngineAdapter {
  start(input: { turnId: string; text: string; thinkingLevel?: import("./types.js").ThinkingLevel; images?: Array<{ mimeType: string; data: string }> }): Promise<{ accepted: boolean; turnId: string }>;
  interrupt(): Promise<void>;
  snapshot(): EngineSnapshot;
  recover(): Promise<EngineSnapshot>;
  shutdown(): Promise<void>;
}
