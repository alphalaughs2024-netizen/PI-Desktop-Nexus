/** Host-owned handles are opaque IDs, never OS PIDs or native exec handles. */
export type ManagedProcessStatus = "starting" | "running" | "stopping" | "exited" | "failed" | "stopped" | "interrupted";
export type ManagedProcessRecord = {
  id: string;
  sessionId: string;
  command: string;
  cwd: string;
  status: ManagedProcessStatus;
  startedAt: number;
  completedAt: number | null;
  exitCode: number | null;
  error: string | null;
  previewUrl: string | null;
};
export type ManagedProcessRead = {
  process?: ManagedProcessRecord;
  processes?: ManagedProcessRecord[];
  output?: Array<{ cursor: number; stream: "stdout" | "stderr"; text: string }>;
  nextCursor?: number;
  outputDropped?: boolean;
  logsAvailable?: boolean;
  timedOut?: boolean;
};
