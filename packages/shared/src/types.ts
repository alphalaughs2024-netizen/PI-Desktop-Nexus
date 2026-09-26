import type { ActivationScope } from "./activation.js";
import type { AppError } from "./errors.js";
import type { KeybindingOverrides } from "./keyboard-shortcuts.js";
import type { CommandShellId } from "./command-shells.js";
import type { NetworkProxySettings } from "./network-proxy.js";

export type Mode = "plan" | "goal" | "agent";

/** Normalize mode values at compatibility boundaries. Older persisted and
 * scheduled data used `chat`; it is now the Plan operating state. */
export function normalizeMode(value: unknown, fallback: Mode = "agent"): Mode {
  if (value === "agent") return "agent";
  if (value === "goal") return "goal";
  if (value === "plan" || value === "chat") return "plan";
  return fallback;
}

/** Approval-proposal discriminator (D198). Plan and Goal share one host
 * approval pipeline; `kind` selects prompts, artifact directory and copy. */
export type ProposalKind = "plan" | "goal";

export const PROPOSAL_KINDS = ["plan", "goal"] as const;

export function normalizeProposalKind(
  value: unknown,
  fallback: ProposalKind = "plan",
): ProposalKind {
  return value === "goal" || value === "plan" ? value : fallback;
}

/** The proposal kind a mode submits, or `null` for freely executing modes. */
export function proposalKindForMode(mode: Mode): ProposalKind | null {
  return mode === "plan" || mode === "goal" ? mode : null;
}

/** The operating mode that owns a proposal kind. */
export function modeForProposalKind(kind: ProposalKind): Mode {
  return kind;
}

export type PlanningState = "inactive" | "planning" | "awaiting_approval";
export type PlanApprovalAction = "approve" | "reject";
export type PlanApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "interrupted";

/** Compatibility name for the proposal-shaped approval wire record. */
export type PlanProposalStatus = PlanApprovalStatus;

export type PlanArtifact = {
  /** Workspace-relative path of the host-created plan artifact. */
  relativePath: string;
  sha256: string;
  sizeBytes: number;
};

export type PlanExecutionState =
  | "queued"
  | "running"
  | "completed"
  | "interrupted";

export type PlanExecutionFinishStatus = Extract<
  PlanExecutionState,
  "completed" | "interrupted"
>;

export type PlanProposal = {
  /** Durable approval/proposal identity. */
  id: string;
  sessionId: string;
  /** Durable host turn ID owning the SubmitPlan/SubmitGoal call. */
  turnId: string;
  /** Exact SubmitPlan/SubmitGoal tool-call ID used to create this approval. */
  toolCallId: string;
  /** Which contract this approval carries; legacy rows read back as `plan`. */
  kind: ProposalKind;
  title: string;
  /** Exact Markdown snapshot submitted for approval. */
  markdown: string;
  question: string;
  artifact?: PlanArtifact;
  /** Host schema/version for this proposal snapshot. */
  version: number;
  status: PlanProposalStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  resolvedAt?: string;
  action?: PlanApprovalAction;
  targetPermissionMode?: GlobalPermissionMode;
  errorCode?: string;
  executionId?: string;
  executionState?: PlanExecutionState;
  /** Persisted snapshot alias retained by the host for compatibility. */
  plan: string;
};

/** Descriptor persisted by the host after approval and consumed by Main. */
export type PlanExecution = {
  id: string;
  proposalId: string;
  sessionId: string;
  /** Which contract was approved; drives the execution instruction. */
  kind: ProposalKind;
  /** Exact approved Markdown snapshot. */
  plan: string;
  title: string;
  question: string;
  artifact: PlanArtifact;
  targetPermissionMode: GlobalPermissionMode;
  state: PlanExecutionState;
};

export type PlanExecutionDescriptor = PlanExecution;
export type ApprovedPlanExecution = PlanExecution;

export type PlanningStateEvent = {
  sessionId: string;
  state: PlanningState;
  /** Absent only for `inactive` transitions that carry no proposal. */
  kind?: ProposalKind;
  proposalId?: string;
  title?: string;
  markdown?: string;
  question?: string;
  artifact?: PlanArtifact;
  version?: number;
  plan?: string;
  action?: PlanApprovalAction;
  targetPermissionMode?: GlobalPermissionMode;
  executionId?: string;
  executionState?: PlanExecutionState;
  proposal?: PlanProposal;
};

export type PlansPendingResult = {
  plans: PlanProposal[];
  state?: PlanningState;
  /** Contract kind the session is currently negotiating, when any (D198). */
  kind?: ProposalKind;
};

export type PlansQueuedExecutionsResult = {
  executions: PlanExecution[];
};

type PlanResolveIdentity = {
  proposalId: string;
  /** Identity fields must match the live host approval row exactly. */
  sessionId: string;
  turnId: string;
  toolCallId: string;
  version?: number;
};

export type PlanResolveRequest =
  | (PlanResolveIdentity & {
      action: "approve";
      targetPermissionMode: GlobalPermissionMode;
    })
  | (PlanResolveIdentity & {
      action: "reject";
      targetPermissionMode?: never;
    });

export type PlanResolutionResult = {
  ok: boolean;
  proposal: PlanProposal;
  state: PlanningState;
  action?: PlanApprovalAction;
  targetPermissionMode?: GlobalPermissionMode;
  execution?: PlanExecution;
};
export const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];
/** Per-subagent selector values; omit leaves the provider's default untouched. */
export const SUBAGENT_THINKING_LEVELS = [...THINKING_LEVELS, "omit"] as const;
export type SubagentThinkingLevel = (typeof SUBAGENT_THINKING_LEVELS)[number];

export type ModelProviderMetadata = string | Record<string, unknown>;
export type ModelExperimentalMetadata = boolean | Record<string, unknown>;

const MODEL_VENDOR_PREFIXES = new Set([
  "anthropic",
  "amazon",
  "aws",
  "cohere",
  "deepseek",
  "deepseek-ai",
  "gemini",
  "google",
  "meta",
  "minimax",
  "mistral",
  "moonshot",
  "moonshotai",
  "openai",
  "qwen",
  "z-ai",
  "zai",
  "zhipuai",
  "x-ai",
  "xai",
]);

/** Match a configured model ID with a namespaced models.dev ID. */
export function modelIdsMatch(candidate: string, requested: string): boolean {
  const left = candidate.trim().toLowerCase();
  const right = requested.trim().toLowerCase();
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.endsWith(`/${right}`) || right.endsWith(`/${left}`)) return true;
  // Some providers use `model@region` aliases; the base model remains the
  // same published record for matching purposes.
  if (left.startsWith(`${right}@`) || right.startsWith(`${left}@`)) return true;
  for (const separator of ["-", "."] as const) {
    const leftPrefix = left.split(`${separator}${right}`, 1)[0];
    if (
      left.startsWith(`${leftPrefix}${separator}${right}`) &&
      MODEL_VENDOR_PREFIXES.has(leftPrefix)
    ) {
      return true;
    }
    const rightPrefix = right.split(`${separator}${left}`, 1)[0];
    if (
      right.startsWith(`${rightPrefix}${separator}${left}`) &&
      MODEL_VENDOR_PREFIXES.has(rightPrefix)
    ) {
      return true;
    }
  }
  return false;
}

/** Provider-local model settings persisted with the provider configuration. */
export type ModelBinding = {
  id: string;
  /** Optional display alias. When set it names the model everywhere the UI
   * shows a model label; the id remains the wire identity. */
  alias?: string;
  contextWindow: number;
  maxTokens: number;
  /** Explicit endpoint levels; an empty or off-only set disables thinking. */
  thinkingLevels: ThinkingLevel[];
  defaultThinkingLevel: ThinkingLevel | null;
  /**
   * User override for image input. `null` or absent follows the published
   * models.dev capability; `true` forces image transport on for an endpoint the
   * catalog describes too narrowly, `false` keeps images out of the request.
   */
  supportsImages?: boolean | null;
  /**
   * User override for document (PDF) input, with the same three-state meaning.
   * Documents are still transported as bounded file references, so this records
   * the capability the model actually has rather than switching the encoding.
   */
  supportsDocuments?: boolean | null;
  /**
   * Whether this model is available for AI-driven subagent delegation.
   * When true, the model appears in the delegation model catalog so the
   * parent agent can pick it at Task time. Defaults to false (opt-in).
   */
  availableForSubagents?: boolean;
};

export type Risk = "low" | "medium" | "high";
export type PermissionDecision = "allow-once" | "allow-session" | "deny";
/** Permission mode (D115): how high-risk tool calls are approved.
 * `inherit` (sessions only) falls back to the global default. */
export const PERMISSION_MODES = [
  "inherit",
  "ask",
  "accept-edits",
  "auto",
  "full-access",
] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];
/** Global default: `inherit` is not meaningful at the settings level. */
export type SessionPermissionMode = Exclude<PermissionMode, never>;
/** Global defaults and contract approvals intentionally exclude Full access. */
export type GlobalPermissionMode = Exclude<PermissionMode, "inherit" | "full-access">;

export type ComposerPermissionMode = Exclude<GlobalPermissionMode, "accept-edits"> | "full-access";

export function isGlobalPermissionMode(
  value: unknown,
): value is GlobalPermissionMode {
  return value === "ask" || value === "accept-edits" || value === "auto";
}

export function normalizeGlobalPermissionMode(
  value: unknown,
  fallback: GlobalPermissionMode = "ask",
): GlobalPermissionMode {
  return isGlobalPermissionMode(value) ? value : fallback;
}

export type UiMessageRole = "user" | "assistant" | "system" | "tool";

export type MessageUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  totalTokens: number;
  cost?: UsageCost;
};

export type UsageCostProvenance = "provider_reported" | "provider_generation" | "provider_account" | "catalog_estimate" | "unpriced" | "unavailable";
export type UsageCostScope = "request" | "session" | "local_history" | "account" | "organization";
export type UsageCost = { amountUsd?: string; provenance: UsageCostProvenance; scope: UsageCostScope; provider?: string; model?: string; generationId?: string; observedAt?: number };

/** Sum two provider usage records. Used for turn rollups, never to rewrite a message. */
export function addUsage(
  total: MessageUsage | undefined,
  next: MessageUsage | undefined,
): MessageUsage | undefined {
  if (!next) return total;
  if (!total) return next;
  return {
    inputTokens: total.inputTokens + next.inputTokens,
    outputTokens: total.outputTokens + next.outputTokens,
    ...(total.cacheReadTokens !== undefined || next.cacheReadTokens !== undefined
      ? {
          cacheReadTokens:
            (total.cacheReadTokens ?? 0) + (next.cacheReadTokens ?? 0),
        }
      : {}),
    ...(total.cacheWriteTokens !== undefined ||
    next.cacheWriteTokens !== undefined
      ? {
          cacheWriteTokens:
            (total.cacheWriteTokens ?? 0) + (next.cacheWriteTokens ?? 0),
        }
      : {}),
    ...(total.reasoningTokens !== undefined || next.reasoningTokens !== undefined
      ? {
          reasoningTokens:
            (total.reasoningTokens ?? 0) + (next.reasoningTokens ?? 0),
        }
      : {}),
    totalTokens: total.totalTokens + next.totalTokens,
  };
}

export type MessageAttachment = {
  kind: "image" | "file";
  name: string;
  /** Workspace-relative path or session-scratch absolute path. */
  ref: string;
  mimeType?: string;
  size?: number;
  /** Sidecar-only hydrated image data; never persisted or sent by the host. */
  data?: string;
};

/** Estimated context footprint for one tool call and its returned result. */
export type ToolTokenUsage = {
  argumentTokens: number;
  resultTokens: number;
  totalTokens: number;
  estimated: true;
};

export type UiMessage = {
  id: string;
  role: UiMessageRole;
  content: string;
  /** Files or images associated with a user turn, kept separate from text. */
  attachments?: MessageAttachment[];
  /** Model reasoning kept separate from the answer text. */
  thinking?: string;
  createdAt: string;
  status?: "streaming" | "complete" | "error" | "aborted";
  /** Provider/model that produced this assistant turn, when known. */
  modelId?: string;
  providerId?: string;
  /** Token usage for the assistant turn, when the provider reported it. */
  usage?: MessageUsage;
  /** Elapsed model streaming time used to calculate output throughput. */
  responseDurationMs?: number;
  /** Output tokens used only for throughput when a stopped stream has no final usage. */
  responseOutputTokens?: number;
  /** Structured failure attached to the assistant turn that failed. */
  error?: AppError;
  /** Stable regenerate-family key shared across rewritten user prompts. */
  revisionRootId?: string;
  /** Total regenerate variants for this user root turn. */
  revisionCount?: number;
  /** 1-based active variant index for this user root turn. */
  activeRevision?: number;
  /**
   * Typed slash invocation ("/name args") when this user message was
   * produced by a prompt-template command; `content` holds the expanded
   * text the model sees (D123). Transcript renders this as a chip.
   */
  command?: string;
  steering?: boolean;
  toolName?: string;
  toolCallId?: string;
  toolStatus?: "running" | "success" | "error" | "denied";
  toolArgs?: unknown;
  toolResult?: unknown;
  /** Estimated tokens occupied by this tool call and its result. */
  toolUsage?: ToolTokenUsage;
  toolCompletedAt?: string;
  toolDurationMs?: number;
  isError?: boolean;
  /**
   * Set on rows produced inside a subagent: the `Task` tool call that spawned
   * the delegate. Two consequences (ADR 0062): the transcript nests these rows
   * under that call, and the parent model never sees them — only the `Task`
   * report enters its context.
   */
  parentToolCallId?: string;
  /** Definition name of the subagent that produced this row. */
  agentName?: string;
};

/** Terminal outcome of one background subagent run. TaskStop adds its own
 * `stopped` projection at the delegation registry layer. */
export type SubagentRunStatus =
  | "completed"
  | "truncated"
  | "failed"
  | "aborted"
  | "timed_out";

/** Maximum number of Unicode code points accepted for a user-defined title. */
export const MAX_SESSION_TITLE_LENGTH = 80;

export type SessionSummary = {
  id: string;
  title: string;
  /** Number of messages in the current canonical transcript. */
  messageCount: number;
  projectPath?: string;
  modelId?: string;
  providerId?: string;
  mode: Mode;
  thinkingLevel: ThinkingLevel;
  /** Per-session permission mode; `inherit` follows the global default (D115). */
  permissionMode: PermissionMode;
  /** Effective capability for this session's exact provider/model pair. */
  supportsReasoning?: boolean;
  /** Effective image-input capability for this session's exact model. */
  supportsVision?: boolean;
  supportedThinkingLevels?: ThinkingLevel[];
  updatedAt: string;
  createdAt: string;
};

export type SessionDetail = SessionSummary & {
  messages: UiMessage[];
  /** Zero-based offset of the first message returned by a bounded history read. */
  messageStart?: number;
  /** True when older messages must be requested with another bounded read. */
  hasMoreBefore?: boolean;
  /** The checkpoint that governs the next model request, i.e. the last of
   * `compactions`. Restored by the runtime on load. */
  compaction?: ContextCompactionRecord;
  /** Every durable checkpoint, oldest first: the transcript shows one row per
   * compaction, the way Codex emits one `ContextCompaction` turn item each. */
  compactions?: ContextCompactionRecord[];
};

/**
 * @deprecated Not surfaced in settings and not persisted through to the
 * runtime. Retained as the runtime's construction-time override, which the
 * tests use to build a compaction-disabled session.
 */
export type ContextCompactionSettings = {
  enabled: boolean;
  reserveTokens: number;
  keepRecentTokens: number;
};

export type ContextCompactionRecord = {
  id: string;
  summary: string;
  firstKeptMessageId?: string;
  throughMessageId: string;
  tokensBefore: number;
  usage?: unknown;
  retainedTail?: unknown[];
  details?: unknown;
  providerId?: string;
  modelId?: string;
  createdAt: string;
};

/** What the context inspector shows about the installed checkpoint. */
export type ContextCompactionStatus = {
  /** How many checkpoints this session has installed, oldest counted as 1. */
  generation: number;
  /** Estimated tokens the summary itself occupies in the model context. */
  summaryTokens: number;
};

/**
 * One compaction, as the transcript renders it — Codex emits a
 * `ContextCompaction` turn item per compaction and this is its equivalent.
 *
 * Both the durable record and the live `compaction_end` event carry a mark
 * rather than the record itself: a record holds the whole summary and retained
 * tail, which is far too much payload for a stream event.
 */
export type ContextCompactionMark = ContextCompactionStatus & {
  id: string;
  /** Last message the checkpoint covers; the row renders right after it. */
  throughMessageId: string;
  /** False when the window rolled over without asking for a summary. */
  summarized: boolean;
};

export type ContextCompactionReason = "manual" | "threshold" | "overflow";
export type ContextCompactionFallback = "retained_tail";

export type MessageRevisionSummary = {
  revisionIndex: number;
  isActive: boolean;
  createdAt: string;
  messageCount: number;
};

export type AgentStatus = {
  sessionId: string;
  isRunning: boolean;
  currentTurnId?: string;
  modelId?: string;
  pendingToolConfirmations: number;
  planningState?: PlanningState;
  pendingPlanId?: string;
  activity?: AgentActivity;
};

/** Bounded provider diagnostics shown while the runtime waits before retrying. */
export type AgentActivityError = {
  code: string;
  message: string;
  providerStatus?: number;
};

/** Coarse child-agent action shown while the parent waits on delegates. */
export type AgentActivityAgentPhase = "waiting-model" | "thinking" | "tool";

export type AgentActivityAgent = {
  name: string;
  lastPhase?: AgentActivityAgentPhase;
  lastToolName?: string;
};

/** The runtime phase that explains a quiet interval in an active turn. */
export type AgentActivity =
  | { phase: "starting"; since: number }
  | { phase: "waiting-model"; since: number }
  | { phase: "preparing"; since: number }
  | {
      phase: "compacting";
      since: number;
      reason: ContextCompactionReason;
    }
  | { phase: "recovering"; since: number }
  | {
      phase: "retrying";
      since: number;
      attempt: number;
      retryDelayMs?: number;
      error?: AgentActivityError;
    }
  | {
      phase: "waiting-subagents";
      since: number;
      subagentCount: number;
      /** Running targets, in wait order, with the latest coarse child action. */
      agents?: AgentActivityAgent[];
    };

export type AgentPromptRequest = {
  sessionId: string;
  content: string;
  /** Attachments are resolved by Electron main and never trusted by the sidecar. */
  attachments?: AgentPromptAttachment[];
  /**
   * When set, truncate the durable transcript to this many leading messages
   * before appending the new user turn. Used by regenerate / edit-resend so
   * the branch replaces the tail instead of stacking a duplicate turn.
   *
   * Prefer `truncateFromMessageId`: a count is only correct when the renderer
   * holds the entire history, and it is kept for older callers.
   */
  truncateBefore?: number;
  /**
   * Identity of the first message to drop. The host resolves it against its own
   * transcript, so a bounded window or a deduplicated renderer array cannot
   * shift the cut. Takes precedence over `truncateBefore`.
   */
  truncateFromMessageId?: string;
  /**
   * Renderer-chosen id for the new user message (D288). The renderer inserts
   * the row under this id before the host round trip, and the host persists
   * and echoes the durable row under the same id so the echo replaces the
   * optimistic row in place instead of adding a second one. Must be a UUID
   * that is not already in the session; anything else is ignored and the host
   * mints its own.
   */
  messageId?: string;
  /**
   * Renderer snapshot of the chat session visible when the prompt was sent.
   * Electron installs it before asynchronous turn setup for notification
   * suppression; missing, null, or mismatched values fail safe.
   */
  viewingSessionId?: string | null;
};

export type AgentPromptAttachment = {
  path: string;
  name: string;
  kind: "image" | "file";
  mimeType?: string;
  size?: number;
};

export type AgentPromptResponse = {
  accepted: boolean;
  turnId: string;
};

/**
 * Additive steering response contract. Legacy runtimes may still return the
 * prompt-shaped response until the Host admission path is upgraded.
 */
export type AgentSteerResponse = SteerOutcome | AgentPromptResponse;

export type AgentSteerRequest = {
  sessionId: string;
  expectedTurnId: string;
  content: string;
  attachments?: AgentPromptAttachment[];
  messageId?: string;
  /** Durable Host queue entry being promoted into this steering turn. */
  queuedPromptId?: string;
};

/** One-shot Composer draft enhancement; this never reads session history. */
export type PromptEnhancementRequest = {
  sessionId?: string | null;
  draft: string;
  /** Renderer snapshot of the model currently shown in the Composer. */
  providerId?: string;
  modelId?: string;
  thinkingLevel?: ThinkingLevel;
};

export type PromptEnhancementResponse = {
  enhancedDraft: string;
};

export type SessionSummarizeTitleRequest = {
  sessionId: string;
  userPrompt: string;
  assistantReply?: string;
  providerId?: string;
  modelId?: string;
  thinkingLevel?: ThinkingLevel;
};

export type SessionSummarizeTitleResponse = {
  title: string;
};

export type AgentExecuteApprovedPlanRequest = {
  sessionId: string;
  turnId: string;
  execution: PlanExecution;
};

export type AgentExecuteApprovedPlanResponse = {
  accepted: boolean;
  turnId: string;
};

export type AgentAbortRequest = {
  sessionId: string;
  turnId?: string;
};

/** Request a stop at the next completed agent turn boundary. */
export type AgentStopRequest = {
  sessionId: string;
  turnId?: string;
};

export type AgentStopResponse = {
  requested: boolean;
};

/** One entry of the Host-owned turn queue as the renderer mirrors it (D386). */
export type QueuedTurnSummary = {
  id: string;
  sessionId: string;
  content: string;
  attachments?: AgentPromptAttachment[];
  position: number;
  createdAt: string;
  priority?: number;
};

export type AgentQueuePushRequest = {
  sessionId: string;
  content: string;
  attachments?: AgentPromptAttachment[];
  idempotencyKey?: string;
};

export type AgentQueueChangedEvent = {
  sessionId: string;
  entries: QueuedTurnSummary[];
};

export type SessionSearchMessageMatch = {
  messageId: string;
  role: string;
  createdAt: string;
  snippet: string;
};

export type SessionSearchHit = {
  session: SessionSummary;
  projectName?: string | null;
  metadataMatch: boolean;
  messageCount: number;
  matches: SessionSearchMessageMatch[];
};

export type AgentCompactRequest = {
  sessionId: string;
};

export type AgentCompactResponse = {
  accepted: boolean;
};

export type ToolPermissionRequest = {
  requestId: string;
  sessionId: string;
  toolCallId: string;
  toolName: string;
  argsPreview: unknown;
  risk: Risk;
  reason: string;
  /** Subagent that asked, when the call came from a delegate (ADR 0062). */
  agentName?: string;
  /** `Task` call that spawned the asking delegate. */
  parentToolCallId?: string;
};

export type ToolPermissionResolution = {
  requestId: string;
  decision: PermissionDecision;
};

/** A model-created question shown in the inline asktool card. */
export type AskToolQuestion = {
  question: string;
  options: string[];
  multiSelect?: boolean;
};

export type AskToolRequest = {
  requestId: string;
  sessionId: string;
  toolCallId: string;
  questions: AskToolQuestion[];
};

/** `null` means the user skipped that question or declined the whole prompt. */
export type AskToolResolution = {
  requestId: string;
  sessionId: string;
  answers: Array<string[] | null>;
};

/** Stable model-facing serialization for one asktool result. */
export function formatAskToolOutput(
  questions: AskToolQuestion[],
  answers: Array<string[] | null>,
): string {
  return questions
    .map((question, index) => {
      const answer = answers[index]?.join("、") ?? "";
      return `${question.question}：${answer}`;
    })
    .join("\n---\n");
}

export type AgentEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messageIds: string[] }
  | { type: "turn_start" }
  | { type: "prompt_composed"; composition: PromptCompositionSnapshot }
  | { type: "lifecycle"; lifecycle: PromptLifecycleEvent }
  | { type: "turn_end"; subagentUsage?: MessageUsage }
  | { type: "message_start"; message: UiMessage }
  | {
      type: "message_update";
      message: UiMessage;
      deltaText?: string;
      deltaThinking?: string;
    }
  | { type: "message_end"; message: UiMessage }
  | { type: "tool_start"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool_update"; toolCallId: string; partialResult?: unknown }
  | {
      type: "tool_end";
      toolCallId: string;
      result: unknown;
      isError?: boolean;
      toolUsage?: ToolTokenUsage;
    }
  | ({ type: "planning_state" } & Omit<PlanningStateEvent, "sessionId">)
  | { type: "tool_permission_request"; request: ToolPermissionRequest }
  | { type: "asktool_request"; request: AskToolRequest }
  | {
      type: "compaction_start";
      reason: ContextCompactionReason;
    }
  | {
      type: "compaction_end";
      reason: ContextCompactionReason;
      ok: boolean;
      tokensBefore?: number;
      firstKeptMessageId?: string;
      willRetry: boolean;
      fallback?: ContextCompactionFallback;
      /** Present when a checkpoint was installed: it feeds the transcript row
       * and the context inspector. */
      mark?: ContextCompactionMark;
      error?: { code: string; message: string };
    }
  | { type: "error"; error: AppError }
  | { type: "status"; status: AgentStatus };

export type PromptCompositionScope = "runtime" | "project" | "session" | "workflow" | "provider";
export type PromptCompositionSection = {
  id: string;
  source: string;
  scope: PromptCompositionScope;
  order: number;
  included: boolean;
  reason: string;
  characters: number;
  estimatedTokens: number;
  hash: string;
  reloadTrigger: string;
  sensitive: boolean;
  context?: ContextPromptProvenance;
};
export type ContextVaultHint = {
  available: boolean;
  matchCount: number;
  possiblyStaleCount: number;
};
export type ContextVaultWarningReason = "stale" | "possibly_stale" | "conflicted" | "superseded" | "unverified" | "duplicate" | "budget" | "unavailable";
export type ContextVaultContext = {
  claims: ContextVaultClaim[];
  selections: Array<{ claimId: string; include: boolean; reason: string; tokens: number }>;
  warnings: Array<{ claimId?: string; reason: ContextVaultWarningReason }>;
};
export type PromptCompositionSnapshot = {
  version: 1;
  hash: string;
  composedAt: number;
  durationMs: number;
  characters: number;
  estimatedTokens: number;
  reloadReason: string;
  sections: PromptCompositionSection[];
};
export type PromptLifecycleKind = "prompt_accepted" | "context_assembled" | "prompt_sent" | "steering_requested" | "steering_accepted" | "steering_queued" | "steering_rejected" | "steering_unavailable" | "steering_failed" | "context_requested" | "context_completed" | "retry_started" | "resume_started" | "resume_success" | "resume_unavailable" | "resume_failed" | "reconnect" | "turn_completed" | "turn_failed";
export type PromptLifecycleEvent = { id: string; kind: PromptLifecycleKind; ts: number; turnId?: string; preview?: string; compositionHash?: string; reason?: string; expectedTurnId?: string; sensitive?: boolean; parentToolCallId?: string; agentName?: string; contextTool?: string; contextIds?: string[]; contextMatchCount?: number; contextPossiblyStaleCount?: number; contextSelectedCount?: number; contextWarningReasons?: string[]; contextBudgetTokens?: number; contextTrigger?: string };
export type PromptLifecycleFilter = "all" | "steering" | "context" | "recovery" | "turn";

export type PersistedLifecycleEvent = PromptLifecycleEvent & {
  schema: 1;
  sessionId: string;
};

export type PersistedPromptComposition = {
  schema: 1;
  id: string;
  kind: "prompt_composed";
  sessionId: string;
  ts: number;
  compositionHash: string;
  estimatedTokens: number;
  sections: Array<Pick<PromptCompositionSection, "id" | "source" | "scope" | "included" | "estimatedTokens" | "hash" | "reason" | "reloadTrigger" | "sensitive" | "context">>;
};

export type PersistedLifecycleRecord = PersistedLifecycleEvent | PersistedPromptComposition;

export type SessionTimelineGetRequest = {
  sessionId: string;
  filter?: PromptLifecycleFilter;
  limit?: number;
};

export type SessionTimelineGetResponse = {
  records: PersistedLifecycleRecord[];
  latestComposition?: PersistedPromptComposition;
};

export type NexusFeatureFlags = {
  structuredComposition: boolean;
  lifecycleTimeline: boolean;
  lifecyclePersistence: boolean;
  contextProvenance: boolean;
  statefulSteering: boolean;
};
export type SteerOutcome =
  | { state: "accepted"; sessionId: string; expectedTurnId: string }
  | { state: "queued"; sessionId: string; expectedTurnId: string; position?: number }
  | { state: "rejected"; reason: "stale_turn" | "not_running" | "plan_pending" | "invalid" }
  | { state: "unavailable"; reason: "provider_unsupported" | "host_offline" | "missing_session" }
  | { state: "failed"; reason: string };

export type ContextPromptProvenance = {
  contextId: string;
  contextSource: string;
  scope: string;
  verificationState?: string;
  inclusionReason: string;
  omissionReason?: string;
};

export type AgentEventEnvelope = {
  sessionId: string;
  turnId?: string;
  ts: number;
  event: AgentEvent;
  /**
   * Set on every event emitted from inside a subagent (ADR 0062): the `Task`
   * tool call that owns the delegate. Main tags persisted rows with it and
   * skips the turn-lifecycle handling that belongs to the parent alone.
   */
  parentToolCallId?: string;
  /** Definition name of the emitting subagent. */
  agentName?: string;
};

export type PromptInspectorState = {
  sessionId: string;
  composition?: PromptCompositionSnapshot;
  lastEvent?: string;
  updatedAt: number;
};

export type AppNotificationKind = "task.completed" | "task.failed";

export type AppNotification = {
  id: string;
  kind: AppNotificationKind;
  sessionId: string;
  sessionTitle: string;
  turnId: string;
  errorCode?: string;
  createdAt: string;
  readAt?: string | null;
};

export type NotificationListResult = {
  notifications: AppNotification[];
  unreadCount: number;
};

export type ProjectWorkspace = {
  path: string;
  name: string;
  /** Best-effort git branch from .git/HEAD when available. */
  branch?: string;
};

export type ProjectRecord = {
  id: number;
  path: string;
  name: string;
  pinned: boolean;
  createdAt: number;
  lastOpenedAt: number;
};

export type PullRequestSummary = {
  number: number;
  title: string;
  url: string;
  author?: string;
  headRefName?: string;
  baseRefName?: string;
  updatedAt?: string;
  isDraft?: boolean;
};

/**
 * `authKind` for a provider row whose credential is a vendor-account OAuth
 * login rather than a pasted API key. Shared so main, the sidecar runtime and
 * the renderer all branch on the same spelling.
 */
export const OAUTH_AUTH_KIND = "oauth";

export type ProviderPublic = {
  id: string;
  name: string;
  vendorKey: string;
  type: "native" | "openai_compatible" | "custom";
  protocol: string;
  enabled: boolean;
  baseUrl?: string;
  authKind: string;
  /** True when the provider holds an API key **or** a vendor-account login. */
  hasSecret: boolean;
  /** True when a vendor-account OAuth credential is stored. */
  hasOauth?: boolean;
  /** Non-secret label for the signed-in account; never carries a token. */
  oauthAccountLabel?: string;
  /**
   * Optional outbound HTTP headers. Empty/absent keeps adapter defaults
   * (pi-ai / `claude-cli` / OpenCode). Not a secret; Authorization and
   * other reserved keys are rejected.
   */
  headers?: Record<string, string>;
  /** Per-model settings selected in the provider dialog. */
  models: ModelBinding[];
  /** @deprecated Use `models[0]?.id`; retained for older runtime consumers. */
  defaultModelId?: string;
  apiStyle?: string;
  /** Effective capability for the provider's current default model. */
  supportsReasoning: boolean;
  /** Effective image-input capability for the provider's current default model. */
  supportsVision?: boolean;
  supportedThinkingLevels: ThinkingLevel[];
  /** Model context window override in tokens (runtime default when absent). */
  contextWindow?: number;
  /** Max output tokens override (runtime default when absent). */
  maxOutputTokens?: number;
  /** Sampling temperature override (provider default when absent). */
  temperature?: number;
  createdAt: string;
  updatedAt: string;
};

export type ProviderCreateInput = {
  name: string;
  vendorKey?: string;
  type?: "native" | "openai_compatible" | "custom";
  protocol?: string;
  baseUrl?: string;
  authKind?: string;
  models?: ModelBinding[];
  /** @deprecated Use `models[0]?.id`; retained for older callers. */
  defaultModelId?: string;
  secretValue?: string;
  apiStyle?: string;
  /**
   * Non-secret label for the signed-in vendor account. Account removal deletes
   * the owning provider row instead of clearing only this label.
   */
  oauthAccountLabel?: string;
  /**
   * Optional outbound HTTP headers. On update, `{}` clears the stored map;
   * omit the field to leave it unchanged.
   */
  headers?: Record<string, string>;
  /** Explicit override for custom model catalogs. */
  supportsReasoning?: boolean;
  /**
   * Optional sparse override for custom/compatible models.
   * Values are canonical ThinkingLevel entries such as ["off","high"].
   * When omitted, capability resolution falls back to catalog/default sets.
   */
  supportedThinkingLevels?: ThinkingLevel[];
  /** Context window override in tokens; on update, 0 clears the override. */
  contextWindow?: number;
  /** Max output tokens override; on update, 0 clears the override. */
  maxOutputTokens?: number;
  /** Sampling temperature override; on update, 0 clears the override. */
  temperature?: number;
};

export type ProviderUpdateInput = Partial<ProviderCreateInput> & {
  id: string;
  enabled?: boolean;
};

/** One locally configured account for a vendor OAuth provider. */
export type OAuthAccount = {
  /** Provider row that owns this account's encrypted OAuth grant. */
  providerId: string;
  /** Non-secret account label, when the vendor exposes one. */
  accountLabel?: string;
  /** False for an orphaned row whose credential has already been removed. */
  connected: boolean;
};

/**
 * A vendor whose subscription account can be signed into instead of pasting an
 * API key. Derived from the runtime's built-in provider catalog, never a
 * hardcoded list. A vendor can own multiple independent local accounts.
 */
export type OAuthVendor = {
  /** Vendor id in the model runtime, e.g. "anthropic", "github-copilot". */
  vendorId: string;
  name: string;
  /** Vendor-supplied call to action, e.g. "Sign in with Claude Pro/Max". */
  loginLabel?: string;
  /** Whether access is backed by a paid subscription rather than usage credit. */
  isSubscription: boolean;
  /** Every local provider row created for this vendor. */
  accounts: OAuthAccount[];
};

export type OAuthPromptOption = {
  id: string;
  label: string;
  description?: string;
};

/** One question the vendor's login flow needs answered before it can finish. */
export type OAuthPromptRequest = {
  promptId: string;
  type: "text" | "secret" | "select" | "manual_code";
  /** Plain text prompts may accept an empty value as a vendor-defined default. */
  message: string;
  placeholder?: string;
  options?: OAuthPromptOption[];
};

/**
 * Progress of one login attempt, pushed to the renderer. Carries nothing
 * secret: tokens stay in the main process.
 */
export type OAuthLoginEvent = {
  loginId: string;
  vendorId: string;
} & (
  | { kind: "info"; message: string; links?: Array<{ url: string; label?: string }> }
  | {
      kind: "authUrl";
      url: string;
      instructions?: string;
      /** False when the browser could not be launched and the user must copy the link. */
      opened: boolean;
    }
  | {
      kind: "deviceCode";
      userCode: string;
      verificationUri: string;
      intervalSeconds?: number;
      expiresInSeconds?: number;
    }
  | { kind: "progress"; message: string }
  | { kind: "prompt"; request: OAuthPromptRequest }
  /** The flow resolved a prompt on its own — e.g. the callback beat the paste box. */
  | { kind: "promptCancelled"; promptId: string }
  | { kind: "done"; providerId: string; accountLabel?: string }
  | { kind: "error"; message: string }
  | { kind: "cancelled" }
);

export type OAuthStartResult = {
  loginId: string;
};

export type OAuthRespondInput = {
  loginId: string;
  promptId: string;
  /** Absent cancels the prompt, which aborts the login flow. */
  value?: string;
};

export const MODEL_MODALITIES = ["text", "image", "audio", "video", "pdf"] as const;
export type ModelModality = (typeof MODEL_MODALITIES)[number];

export type ModelReasoningOption = {
  type: string;
  values?: Array<string | null>;
  min?: number;
  max?: number;
};

export type ModelInterleaved = boolean | { field?: string };

export type ModelModalities = {
  input: readonly ModelModality[];
  output: readonly ModelModality[];
};

export type ModelLimit = {
  context?: number;
  input?: number;
  output?: number;
};

export type ModelCostTier = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  tier?: { type?: string; size?: number };
};

export type ModelCost = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  reasoning?: number;
  inputAudio?: number;
  outputAudio?: number;
  contextOver200k?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  tiers?: ModelCostTier[];
};

export type ModelInfo = {
  modelId: string;
  displayName: string;
  providerId: string;
  description?: string;
  family?: string;
  attachment?: boolean;
  reasoning?: boolean;
  reasoningOptions?: ModelReasoningOption[];
  thinkingLevelMap?: Partial<Record<ThinkingLevel, string | null>>;
  toolCall?: boolean;
  structuredOutput?: boolean;
  temperature?: boolean;
  knowledge?: string;
  releaseDate?: string;
  lastUpdated?: string;
  modalities?: ModelModalities;
  /** Catalog modalities before a provider binding applies local overrides. */
  publishedModalities?: ModelModalities;
  openWeights?: boolean;
  limit?: ModelLimit;
  cost?: ModelCost;
  interleaved?: ModelInterleaved;
  status?: string;
  /** Provider-local upstream metadata, including models.dev adapter details. */
  provider?: ModelProviderMetadata;
  /** Model metadata extension published by models.dev. */
  experimental?: ModelExperimentalMetadata;
  /** Convenience values retained for existing UI and cache consumers. */
  contextWindow?: number;
  maxTokens?: number;
  capabilities: Array<
    | "text"
    | "tools"
    | "vision"
    | "reasoning"
    | "json"
    | "audio"
    | "video"
    | "pdf"
    | "attachments"
    | "temperature"
  >;
  supportedThinkingLevels?: ThinkingLevel[];
  source: "bundled" | "discovered" | "user";
  /** Metadata catalog that supplied this row, when it is a known model. */
  catalogSource?: "models.dev";
};

/**
 * Built-in themes, or `plugin:<pluginId>:<themeId>` for a theme contributed by
 * a plugin. The shell falls back to `system` when the provider goes away.
 */
export type ThemePreference =
  | "system"
  | "light"
  | "dark"
  | "twilight-mountains"
  | "alpine-light"
  | "obsidian-horizon"
  | "emerald-afterglow"
  | `plugin:${string}`;

export type ScenicBackdropBlur = number;
export type ScenicThemeId = "twilight-mountains" | "alpine-light" | "obsidian-horizon" | "emerald-afterglow";
/** @deprecated Use ScenicBackdropBlur. Kept for persisted Twilight settings compatibility. */
export type TwilightBackdropBlur = "low" | "medium" | "high";

export const DEFAULT_SCENIC_BACKDROP_BLUR: ScenicBackdropBlur = 6;
/** @deprecated Use DEFAULT_SCENIC_BACKDROP_BLUR. */
export const DEFAULT_TWILIGHT_BACKDROP_BLUR: TwilightBackdropBlur = "low";

export function normalizeScenicBackdropBlur(value: unknown): ScenicBackdropBlur {
  if (typeof value === "number" && Number.isInteger(value)) return Math.max(0, Math.min(20, value));
  return DEFAULT_SCENIC_BACKDROP_BLUR;
}

export function scenicBackdropBlurDefault(theme: ScenicThemeId): number {
  return theme === "alpine-light" ? 8 : 6;
}

export function resolveScenicBackdropBlur(settings: Pick<AppSettings, "scenicBackdropBlur" | "scenicBackdropBlurByTheme" | "twilightBackdropBlur">, theme: ScenicThemeId): number {
  const stored = settings.scenicBackdropBlurByTheme?.[theme];
  if (typeof stored === "number") return normalizeScenicBackdropBlur(stored);
  return migrateScenicBackdropBlur(settings.scenicBackdropBlur ?? settings.twilightBackdropBlur, theme);
}

export function migrateScenicBackdropBlur(value: unknown, theme: ScenicThemeId): number {
  if (typeof value === "number" && Number.isInteger(value)) return normalizeScenicBackdropBlur(value);
  const defaults: Record<ScenicThemeId, Record<string, number>> = {
    "twilight-mountains": { low: 2, medium: 6, high: 12 },
    "alpine-light": { low: 4, medium: 8, high: 16 },
    "obsidian-horizon": { low: 2, medium: 6, high: 12 },
    "emerald-afterglow": { low: 2, medium: 6, high: 12 },
  };
  if (typeof value === "string" && value in defaults[theme]) return defaults[theme][value] ?? DEFAULT_SCENIC_BACKDROP_BLUR;
  return theme === "alpine-light" ? 8 : DEFAULT_SCENIC_BACKDROP_BLUR;
}

/** @deprecated Use normalizeScenicBackdropBlur. */
export function normalizeTwilightBackdropBlur(value: unknown): TwilightBackdropBlur {
  return value === "medium" || value === "high" ? value : "low";
}

/**
 * What closing the main window does on Windows/Linux. macOS keeps the native
 * Dock lifecycle and never consults this preference.
 * - `ask`: transient unset state — the first close prompts once; after a
 *   choice is made it is remembered permanently and cannot be reverted
 * - `tray`: hide to the system tray; the app keeps running in the background
 * - `quit`: close the window and exit the app (legacy behavior)
 */
export type CloseBehavior = "ask" | "tray" | "quit";

export type AppSettings = {
  /** Core capability policy. Missing entries use product defaults. */
  coreCapabilities?: Partial<Record<CoreCapabilityId, { enabled: boolean }>>;
  defaultProviderId?: string;
  defaultModelId?: string;
  defaultMode: Mode;
  /** Configured command shell for the agent Bash protocol tool. */
  defaultCommandShell?: CommandShellId;
  /** Global permission mode default; sessions with `inherit` follow this. */
  defaultPermissionMode?: GlobalPermissionMode;
  theme: ThemePreference;
  /** Blur strength for the active scenic theme's backdrop image. */
  scenicBackdropBlur?: ScenicBackdropBlur;
  scenicBackdropBlurByTheme?: Partial<Record<ScenicThemeId, ScenicBackdropBlur>>;
  /** @deprecated Read for migration compatibility; new writes use scenicBackdropBlur. */
  twilightBackdropBlur?: TwilightBackdropBlur;
  /** UI language; `auto` (and absent) follows the OS locale. */
  language?: "auto" | "en" | "zh-CN" | "zh-TW" | "tr" | "de" | "es" | "fr" | "ko";
  /**
   * Global UI font stack (CSS `font-family` value). Absent means the built-in
   * token stack; bundled open-source families and installed system families
   * are offered by the settings picker.
   */
  fontFamily?: string;
  /**
   * Global UI type scale (D343). `1` is the product `--text-*` ramp.
   * Absent means 1. Range 0.8–1.5 in 0.025 steps. Window zoom is independent.
   */
  fontScale?: number;
  /**
   * @deprecated Unreleased D343 px field. Reads migrate into `fontScale`
   * as `px / 14`; new writes persist `fontScale` instead.
   */
  fontSize?: number;
  enterToSend: boolean;
  /** Text length above which a plain-text paste becomes a session file reference. */
  largePasteThreshold?: number;
  /**
   * @deprecated No longer read. Compaction derives its budgets from the model
   * window instead of exposing knobs; persisted values are ignored so a
   * session disabled long ago is not stuck without a switch to re-enable it.
   */
  contextCompaction?: ContextCompactionSettings;
  /** User overrides for the shared application shortcut map. */
  keybindings?: KeybindingOverrides;
  /** Unlocks the devtools console (settings button, F12, macOS View menu). */
  developerMode?: boolean;
  /**
   * Extension marketplace provider. `mirror` targets the cnb.cool copy for
   * networks that cannot reach `raw.githubusercontent.com`; both serve the
   * same catalog and packages.
   */
  pluginMarketSource?: PluginMarketSource;
  /** Catalog URL used when `pluginMarketSource` is `custom`. */
  pluginMarketCustomUrl?: string;
  /**
   * Outbound proxy for app-owned HTTP (D340). Absent means System: Chromium
   * follows the OS proxy; Node sidecar traffic stays direct unless Custom
   * is set. See `network-proxy.ts`.
   */
  networkProxy?: NetworkProxySettings;
  /**
   * Preferred destination when clicking HTTP/HTTPS links in chat messages.
   * `workpanel`: Preview in the Work Panel browser tab (default).
   * `external`: Open directly in the system's default web browser.
   */
  linkOpenTarget?: LinkOpenTarget;
  onboardingDismissed: boolean;
};

export type CoreCapabilityId = "browser";
export type CoreCapabilitySummary = {
  id: CoreCapabilityId;
  label: string;
  enabled: boolean;
  readiness?: string;
  disablementSupported: true;
  compatibilityAdapter: "available" | "unavailable";
};

export type LinkOpenTarget = "workpanel" | "external";

export type PluginMarketSource = "official" | "mirror" | "custom";

export type PluginUpdateInfo = {
  version: string;
  changelog?: string;
  shasum: string;
  url: string;
  permissionDiff?: string[];
};

/**
 * Trust tier the host is willing to render for a catalog entry.
 *
 * Issued by the plugin center, never asserted by a publisher: the host
 * downgrades a `verified` claim from any source other than the configured
 * official one, and renders an unrecognised tier as `unknown` (ADR 0102).
 */
export type MarketTrust = "verified" | "community" | "unknown";

/**
 * Source pin recorded for a published version.
 *
 * Evidence for a human decision before install, not an integrity control — it
 * is only as trustworthy as the catalog it came from, and the checksum stays
 * the mechanism that decides whether bytes are accepted.
 */
export type MarketProvenance = {
  /** Canonical https URL of the publisher's own repository. */
  sourceRepository: string;
  /** `refs/tags/<tag>` or a 40-hex commit, as submitted. */
  sourceRef?: string;
  /** Resolved 40-hex commit the artifact was built from. */
  sourceCommit?: string;
  /** Plugin directory inside that repository. */
  sourcePath?: string;
  builder?: string;
  builtAt?: string;
};

/** Publish verdict issued by the center's policy evaluator. */
export type MarketReview = {
  decision?: string;
  risk?: string;
  policyVersion?: string;
  reviewedAt?: string;
};

/** Distribution-side withdrawal of the exact version installed here. */
export type PluginYankNotice = {
  version: string;
  reason?: string;
};

export type PluginMarketplaceMeta = {
  providerId: string;
  shasum?: string;
  publisherId?: string;
  /** Trust tier accepted at install time, kept for later display. */
  trust?: MarketTrust;
  /** Source pin of the installed version, when the catalog carried one. */
  provenance?: MarketProvenance;
};

export type PluginUiMeta = {
  panel?: string;
  width?: number;
  height?: number;
  title?: string | PluginLocalizedString;
};

/**
 * One plugin-contributed work panel view, resolved for the current window.
 *
 * The renderer never reads a manifest: the main process resolves the localized
 * title against the active locale, filters by permission, activation scope, and
 * entry existence, and hands over only what the panel menu has to draw. `icon`
 * is a token from the SDK's closed list, not plugin markup.
 */
export type PluginViewMeta = {
  pluginId: string;
  /** Plugin-local view id from `contributes.views[].id`. */
  viewId: string;
  /** `<pluginId>/<viewId>` — the work panel tab's resource string. */
  ref: string;
  /** Already resolved against the host locale. */
  title: string;
  /** Owning plugin's display name, for tooltips and disambiguation. */
  pluginName: string;
  icon?: string;
  order: number;
};

/**
 * Which files one file mode may touch, straight from `manifest.fs`. Declared
 * here rather than imported from the plugin SDK because this package sits under
 * it: the SDK owns the matching and the host owns the enforcement, while this is
 * only the shape that reaches the UI so a user can see what they granted.
 */
export type PluginFsRule = {
  /** `workspace` unless the plugin asks the user to point at a directory. */
  root?: "workspace" | "userSelected";
  /** Globs relative to the root. Empty means "nothing without confirmation". */
  scope?: string[];
  /** Delete only: files the plugin wrote itself, which need no scope. */
  own?: boolean;
};

export type PluginFsPolicy = {
  read?: PluginFsRule;
  write?: PluginFsRule;
  delete?: PluginFsRule;
};

/** Localized plugin labels match the desktop shell's supported locales. */
export type PluginLocalizedString = {
  en: string;
  "zh-CN": string;
};

export type PluginCapability =
  | "panel"
  | "views"
  | "commands"
  | "tools"
  | "skills"
  | "themes"
  | "mcp"
  | "services"
  | "bus"
  /** `contributes.agentExtensions`: ExtensionAPI modules in the agent process. */
  | "agentExtension";

export type PluginSettingType =
  | "string"
  | "number"
  | "boolean"
  | "select"
  | "json"
  | "shortcut";

export type PluginSettingOption = {
  label: string;
  value: string | number | boolean;
};

/** Declarative setting rendered by the installed-plugin settings surface. */
export type PluginSettingDefinition = {
  key: string;
  title: string;
  description?: string;
  type: PluginSettingType;
  default?: unknown;
  enum?: PluginSettingOption[];
  /** Shortcut settings invoke this plugin command in the app window. */
  command?: string;
  /** The first shortcut scope; global registration is intentionally not supported. */
  scope?: "plugin";
  /** Resolved private value, returned only to the owning plugin settings UI. */
  value?: unknown;
};

/** A theme contributed by a loaded plugin, with its sanitized CSS payload. */
export type PluginTheme = {
  /** `plugin:<pluginId>:<themeId>`; matches `AppSettings.theme`. */
  id: `plugin:${string}`;
  pluginId: string;
  themeId: string;
  label: string;
  /** Palette the overrides layer on; drives the `data-theme` attribute. */
  base: "light" | "dark";
  css: string;
};

export type PluginServiceState = "starting" | "running" | "stopped" | "failed";

/** Supervision state of one resident plugin service (spec 07 §5). */
export type PluginServiceStatus = {
  pluginId: string;
  serviceId: string;
  label: string;
  state: PluginServiceState;
  /** Host-process restarts this service survived since it was last started. */
  restarts: number;
  /** Why the service is `failed`. */
  message?: string;
  updatedAt: number;
};

export type PluginSummary = {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  /** Where the plugin is allowed to run; absent records predate scopes. */
  scope?: ActivationScope;
  source: "installed" | "dev" | "marketplace";
  status: "ready" | "error" | "disabled" | "load_error";
  errorMessage?: string;
  permissions: string[];
  path?: string;
  /** Derived from the manifest by the host: which contribution kinds exist. */
  capabilities?: PluginCapability[];
  description?: string;
  author?: string;
  installedAt?: string;
  updatedAt?: string;
  marketplace?: PluginMarketplaceMeta;
  autoUpdate?: boolean;
  updateAvailable?: PluginUpdateInfo;
  /**
   * Set when the catalog withdrew the exact version installed here. The host
   * surfaces it and leaves the plugin running; withdrawal is a distribution
   * signal, not consent to disable working software.
   */
  yanked?: PluginYankNotice;
  ui?: PluginUiMeta;
  /** Declared file scope, so the page can show it next to the permissions. */
  fs?: PluginFsPolicy;
  settings?: PluginSettingDefinition[];
  /** Live state of the plugin's `contributes.agentExtensions` modules, from
   * the most recent session that loaded them (spec 07-plugins/16 §11). */
  agentExtension?: PluginAgentExtensionStatus;
};

/** What the agent process reported for one plugin's ExtensionAPI modules. */
export type PluginAgentExtensionStatus = {
  /** `enabled` until a session loads the modules in this app run. */
  state: "enabled" | "loaded" | "error";
  toolNames: string[];
  commandNames: string[];
  diagnostics: import("./trusted-extensions.js").TrustedExtensionDiagnostic[];
};

/** The filesystem level that owns an agent capability. */
export type AgentCapabilityLevel = "global" | "project";

/** A settings-page query for one capability column. */
export type AgentCapabilityQuery = {
  level: AgentCapabilityLevel;
  projectPath?: string;
};

/** Transport of an MCP server the user configured themselves. */
export type McpTransport = "stdio" | "http";

/**
 * An MCP server the user added directly, without a plugin around it.
 *
 * The shape deliberately mirrors `contributes.mcpServers` (ADR 0038) so both
 * kinds go through one client implementation; what differs is ownership. A user
 * server has no plugin to grant permissions to, so its consent is the act of
 * typing the command or the URL, and its credentials come from `env`/`headers`
 * on the record instead of a plugin's settings.
 */
export type McpServerRecord = {
  id: string;
  label: string;
  /** Filesystem ownership, present for the Agent settings management page. */
  level?: AgentCapabilityLevel;
  /** Project root when `level === "project"`. */
  projectPath?: string;
  /** Absolute config path; never used for activation state. */
  path?: string;
  description?: string;
  transport: McpTransport;
  /** stdio: executable name or absolute path. */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /** http: absolute endpoint; HTTP is allowed for local and LAN servers. */
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  scope?: ActivationScope;
  createdAt: string;
  updatedAt: string;
};

/** Fields accepted when creating or editing a user MCP server. */
export type McpServerInput = {
  id: string;
  label?: string;
  level?: AgentCapabilityLevel;
  projectPath?: string;
  description?: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  scope?: ActivationScope;
};

export type McpConnectionState = "idle" | "connecting" | "ready" | "failed";

/** Live connection state of one user MCP server, as the Extensions page shows it. */
export type McpServerStatus = {
  serverId: string;
  state: McpConnectionState;
  /** Tools discovered by the last successful `tools/list`. */
  toolCount: number;
  toolNames?: string[];
  message?: string;
  updatedAt: number;
};

/** A user MCP server plus whatever the runtime knows about its connection. */
export type McpServerView = McpServerRecord & {
  status?: McpServerStatus;
};

/**
 * A skill document the user owns, stored under `~/.agents/skills` or a
 * project's `.agents/skills` directory.
 *
 * Reaches the model through the same catalog-plus-`Skill`-tool path as built-in
 * and plugin skills (D174), so the three are indistinguishable once loaded.
 */
export type UserSkillRecord = {
  /** Slug used both as the directory name and as the id the model passes. */
  id: string;
  name: string;
  /** Filesystem ownership, present for the Agent settings management page. */
  level?: AgentCapabilityLevel;
  /** Project root when `level === "project"`. */
  projectPath?: string;
  description?: string;
  enabled: boolean;
  scope?: ActivationScope;
  /** `created` writes a template; `imported` copies an existing document. */
  source: "created" | "imported";
  /** Absolute path of the document, for opening it in the editor. */
  path: string;
  /** Bytes of the document, so the list can flag one that grew past the cap. */
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

export type UserSkillInput = {
  id?: string;
  name: string;
  level?: AgentCapabilityLevel;
  projectPath?: string;
  description?: string;
  body?: string;
  enabled?: boolean;
  scope?: ActivationScope;
};

/** A reviewed, read-only skill bundled with the Nexus application. */
export type BuiltinSkillRecord = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  source: "nexus";
  version: string;
};

/** A Nexus workflow package is model guidance only; it never grants authority. */
export type WorkflowRecord = {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  supported: boolean;
  unavailableReason?: "disabled" | "unsupported_capability" | "unsupported_mode" | "dismissed";
  supportedModes: Mode[];
  requiredCapabilities: string[];
  priority: number;
};

export type WorkflowSessionStatus = {
  primary?: {
    id: string;
    name: string;
    stage: string;
    source: "automatic" | "manual";
    reasonCategory: string;
    activatedAt?: string;
    /** Host-derived next step for lifecycle workflows; never plan text. */
    nextAction?: string;
  };
  supportingIds: string[];
  available: WorkflowRecord[];
};

/** User/project workflow package metadata. Its declared capabilities are host
 * facts for compatibility only and never grant tools or permissions. */
export type WorkflowPackageRecord = {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  level: AgentCapabilityLevel;
  projectPath?: string;
  path: string;
  supportedModes: Mode[];
  requiredCapabilities: string[];
  priority: number;
  defaultStage: string;
  compatibility: { status: "compatible" | "upgrade_required" | "unsupported"; message: string };
};

export type WorkflowPackageInput = {
  id?: string;
  name: string;
  description: string;
  version: string;
  body: string;
  level?: AgentCapabilityLevel;
  projectPath?: string;
  supportedModes: Mode[];
  requiredCapabilities: string[];
  priority: number;
  defaultStage: string;
  automatic: boolean;
  activationTerms: string[];
  fixtures: Array<{ positivePrompt: string; negativePrompt: string; expectedStage: string }>;
  enabled?: boolean;
};

/**
 * A global subagent definition the user owns, stored as `~/.agents/subagents/<id>.md`
 * (D202, ADR 0063). Project roots do not provide subagent definitions.
 *
 * `id` and `name` are deliberately the same string: the name
 * is the handle the model passes to `Task`, and keeping the document named after
 * it is what lets the UI tell which source won a name.
 */
export type UserSubagentRecord = {
  id: string;
  name: string;
  /** Subagents are global-only; the level is explicit for the settings API. */
  level?: "global";
  description: string;
  enabled: boolean;
  scope?: ActivationScope;
  /** Resolved tool grant, never empty — what the delegate may actually call. */
  tools: string[];
  /** `<provider>/<model>` pin, resolved against providers at launch. */
  model?: string;
  thinkingLevel?: SubagentThinkingLevel;
  maxTurns?: number;
  /** Output-token cap for one delegate response; omitted follows the model. */
  maxTokens?: number;
  /** Absolute path of the document, for revealing it. */
  path: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

export type UserSubagentInput = {
  id?: string;
  name?: string;
  description?: string;
  body?: string;
  tools?: string[];
  /** Empty string clears the pin; absent leaves it unchanged. */
  model?: string;
  thinkingLevel?: SubagentThinkingLevel | "";
  /** `0` clears the override; absent leaves it unchanged. */
  maxTurns?: number;
  /** `0` clears the cap; absent leaves it unchanged. */
  maxTokens?: number;
  enabled?: boolean;
  scope?: ActivationScope;
};

export type MarketPluginSummary = {
  id: string;
  name: string;
  description: string;
  author: string;
  iconUrl?: string;
  latestVersion: string;
  downloads?: number;
  updatedAt: string;
  categories?: string[];
  permissionSummary: string[];
  verified?: boolean;
  /** Catalog v2 trust tier, as the host is willing to render it. */
  trust?: MarketTrust;
  publisherId?: string;
  installed?: boolean;
  installedVersion?: string;
  updateAvailable?: boolean;
  /** False when `latestVersion` has no published package to download yet. */
  installable?: boolean;
  /** True when every catalog version of this plugin has been withdrawn. */
  yanked?: boolean;
};

export type MarketPluginDetail = MarketPluginSummary & {
  readmeMarkdown?: string;
  versions: Array<{
    version: string;
    publishedAt: string;
    changelog?: string;
    minPiDesktop?: string;
    shasum: string;
    url: string;
    sizeBytes: number;
    permissions: string[];
    /** Withdrawn: still listed in history, never offered for install. */
    yanked?: boolean;
    yankedReason?: string;
    provenance?: MarketProvenance;
    review?: MarketReview;
    signature?: string;
    signatureAlg?: string;
    keyId?: string;
  }>;
  screenshots?: string[];
  homepage?: string;
  repository?: string;
  permissions: string[];
  safetyNotes?: string;
};

export type PluginInstallResult = {
  plugin: PluginSummary;
  upgraded: boolean;
  permissionDiff: string[];
};

export type CommandItem = {
  id: string;
  title: string;
  category?: string;
  keywords?: string[];
  source: "builtin" | "plugin" | "extension";
  pluginId?: string;
  /** Trusted extension that registered the command (`source: "extension"`). */
  extensionId?: string;
};

/** One entry of the composer "/" menu, merged from three sources (D123). */
export type ComposerCommand = {
  /** Slash name typed after "/"; unique across the merged list. */
  name: string;
  kind: "template" | "builtin" | "plugin" | "extension";
  /** Display title (templates use their name). */
  title: string;
  description?: string;
  /** Template frontmatter `argument-hint`, shown as ghost text. */
  argumentHint?: string;
  /** Template provenance; project templates override user-global ones. */
  source?: "project" | "user";
  /** Palette command id for builtin/plugin execution. */
  id?: string;
};

/** One clipboard file transferred from the renderer to the composer bridge. */
export type ComposerPasteFile = {
  name?: string;
  mimeType?: string;
  /** Set for generated large-text pastes so history can retain the text. */
  recordHistory?: boolean;
  data: ArrayBuffer;
};

/** A clipboard file materialized in the originating session's scratch root. */
export type ComposerPastedFile = {
  /** UUID-backed canonical path used by the prompt and file tools. */
  path: string;
  /** Sanitized original leaf name used only for compact composer display. */
  name: string;
  kind: "image" | "file";
  mimeType: string;
  size: number;
};

export type AppVersionInfo = {
  name: string;
  version: string;
  protocolVersion: number;
  hostProtocolVersion?: number;
  hostVersion?: string;
  platform: string;
  arch: string;
};

/**
 * A bounded, local-only summary of a repeated diagnostic condition.
 *
 * This deliberately contains neither the original log message nor arbitrary
 * fields from the triggering operation. Raw records remain in the categorized
 * NDJSON logs for local troubleshooting.
 */
export type DiagnosticIncidentSummary = {
  code: string;
  fingerprint: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  retryable: boolean;
  suggestedAction?: string;
};

export type AppHealthUpdater = {
  mode: UpdateMode;
  status: UpdateStatus;
  classification?:
    | "feed-unavailable"
    | "network"
    | "configuration"
    | "timeout";
};

/** Main-owned, privacy-safe runtime state added to `app.health`. */
export type AppHealthRuntime = {
  updater?: AppHealthUpdater;
  summonShortcut?: SummonShortcutStatus;
  hostAvailable?: boolean;
};

export type AppHealthWorkspace = {
  mode: "project-attached" | "scratch-only";
  attached: boolean;
  ready: boolean;
};

export type AppHealthCapabilities = {
  core: number;
  available: number;
};

export type HostHealth = {
  ok: boolean;
  protocolVersion: number;
  version: string;
  uptimeMs: number;
  /** Optional additive diagnostics; older consumers can ignore these fields. */
  runtime?: AppHealthRuntime;
  workspace?: AppHealthWorkspace;
  capabilities?: AppHealthCapabilities;
  incidents?: DiagnosticIncidentSummary[];
};

/** Main-owned registration state for the global summon-window shortcut. */
export type SummonShortcutStatus = {
  binding: string | null;
  accelerator: string | null;
  registered: boolean;
  errorCode?: "SHORTCUT_CONFLICT" | "SHORTCUT_UNAVAILABLE";
};

/** Payload of the `hostStatus` push event (backend supervision state). */
export type HostStatusEvent = {
  ok: boolean;
  component?: "host" | "sidecar";
  restarting?: boolean;
  restarted?: boolean;
  fatal?: boolean;
  /** Free text, or a status token such as `GLIBC_UNSUPPORTED` / `DB_SCHEMA_TOO_NEW`. */
  message?: string;
  /** Schema numbers behind `DB_SCHEMA_TOO_NEW`. */
  schema?: { found: number; supported: number };
  /** Set on the boot status when the build is not native to this CPU. */
  archMismatch?: { platform: string; processArch: string; machineArch: string };
};

/**
 * How app updates are delivered on this install:
 *  - in-app: electron-updater downloads and installs (Windows NSIS, Linux AppImage)
 *  - manual: we only detect new versions and link to the releases page
 *    (unsigned macOS builds, Linux deb)
 *  - disabled: development / unpackaged build
 */
export type UpdateMode = "in-app" | "manual" | "disabled";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "up-to-date"
  | "downloading"
  | "downloaded"
  | "error";

/** Snapshot pushed on the `updatesState` event and returned by updates IPC. */
export type UpdateState = {
  mode: UpdateMode;
  status: UpdateStatus;
  currentVersion: string;
  availableVersion?: string;
  /**
   * Localized product highlights for `availableVersion` from the shipped-locale
   * in-app changelog. Plain text (bullet lines); absent when the version has
   * no catalog entry. Main selects the locale — the renderer never supplies
   * a feed or remote notes URL (ADR 0022 / D164).
   */
  releaseNotes?: string;
  /** 0-100 while status is "downloading". */
  progressPercent?: number;
  error?: string;
  /** True when the transition came from a user-initiated check. */
  manual?: boolean;
  releasesUrl: string;
};

export type OnboardingState = {
  showChecklist: boolean;
  steps: Array<{
    id: string;
    title: string;
    done: boolean;
    action?: string;
  }>;
};


export type ScheduledTaskCadence = "manual" | "hourly" | "daily" | "weekly";

export type ScheduledTask = {
  id: string;
  title: string;
  prompt: string;
  cadence: ScheduledTaskCadence;
  mode: Mode;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
};

export type ScheduledTaskRun = {
  id: string;
  taskId: string;
  sessionId?: string | null;
  status: "running" | "completed" | "aborted" | "error";
  errorCode?: string | null;
  startedAt: string;
  endedAt?: string | null;
};

// --- Work panel (review / browser / files / plugin views) ---

export type DiffLineType = "add" | "del" | "context";

export type DiffLine = {
  type: DiffLineType;
  text: string;
};

export type DiffHunk = {
  /** Raw `@@ -a,b +c,d @@ …` header line. */
  header: string;
  lines: DiffLine[];
};

export type ReviewChangeOperation = "write" | "edit" | "delete";
export type ReviewChangeStatus = "added" | "modified" | "deleted";
export type ReviewChangeState = "active" | "rolledBack";

/**
 * Durable, message-owned change evidence returned by a workspace mutation.
 * Unlike WorkspaceDiff, this record remains valid after a git commit.
 */
export type ReviewChange = {
  version: 1;
  snapshotId: string;
  messageId: string;
  path: string;
  operation: ReviewChangeOperation;
  status: ReviewChangeStatus;
  state: ReviewChangeState;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  binary?: boolean;
  truncated?: boolean;
  reversible: boolean;
};

export type ReviewRollbackStatus =
  | "rolledBack"
  | "alreadyRolledBack"
  | "conflict"
  | "unavailable";

export type ReviewRollbackResult = {
  status: ReviewRollbackStatus;
  snapshotId: string;
  messageId?: string;
  path?: string;
};

export type DiffFileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "untracked";

export type DiffFile = {
  path: string;
  oldPath?: string;
  status: DiffFileStatus;
  additions: number;
  deletions: number;
  binary?: boolean;
  /** Patch exceeded the per-file cap; hunks are omitted. */
  tooLarge?: boolean;
  hunks: DiffHunk[];
};

export type WorkspaceDiff = {
  /** Workspace root is a git work tree. */
  repo: boolean;
  /** No pending changes (only meaningful when repo). */
  clean: boolean;
  files: DiffFile[];
  /** File list hit the cap; more changes exist than listed. */
  truncated?: boolean;
};

export type BrowserAction = "back" | "forward" | "reload" | "stop";

/** Phase 0 contract types; runtime migration is intentionally deferred. */
export type BrowserId = string & { readonly __browserId: unique symbol };
export type BrowserRequestId = string & { readonly __browserRequestId: unique symbol };
export type BrowserSnapshotId = string & { readonly __browserSnapshotId: unique symbol };
export type BrowserElementRef = string & { readonly __browserElementRef: unique symbol };
export type BrowserErrorCode = "BROWSER_UNAVAILABLE" | "BROWSER_POLICY_BLOCKED" | "BROWSER_TAB_NOT_FOUND" | "BROWSER_STALE_REF" | "BROWSER_TIMEOUT" | "BROWSER_POSSIBLY_APPLIED" | "BROWSER_UNSUPPORTED" | "BROWSER_INVALID_INPUT" | "BROWSER_UNKNOWN_ERROR";
export type BrowserRequestContext = { requestId: BrowserRequestId; sessionId: string; turnId?: string; effectiveAgentId?: string; mode: "plan" | "agent"; permissionEpoch: number; browserId: BrowserId };
export type BrowserResult<T = unknown> = { requestId: BrowserRequestId; ok: boolean; code?: BrowserErrorCode; retryable?: boolean; possiblyApplied?: boolean; message?: string; result?: T };
export type BrowserWaitCondition = { kind: "url"; match: "equals" | "contains"; value: string } | { kind: "text"; value: string } | { kind: "page_load" };
export type BrowserToolName = "browser_list_tabs" | "browser_open" | "browser_navigate" | "browser_snapshot" | "browser_screenshot" | "browser_click" | "browser_fill" | "browser_type" | "browser_keypress" | "browser_wait" | "browser_console" | "browser_evaluate" | "browser_cdp";
export type BrowserReadiness = "uninitialized" | "starting" | "ready" | "loading" | "unavailable" | "blocked" | "closed";
export type BrowserDiagnostics = {
  capabilityEnabled: boolean;
  readiness: BrowserReadiness;
  browserId?: BrowserId;
  guestGeneration?: number;
  chromeSessionId?: string;
  lastTransition?: { state: BrowserReadiness; reason: "startup" | "navigation" | "guest-loss" | "policy" | "recovery" | "shutdown"; at: number };
  pendingRequestCount: number;
  activeQueueCount: number;
  compatibilityAdapter: "available" | "blocked" | "unavailable";
  lastErrorCode?: BrowserErrorCode;
  lastErrorReason?: string;
  safeSuggestedAction?: string;
};

export type BrowserState = {
  url: string;
  title: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
};

export type BrowserScreenshotOptions = { fullPage?: boolean; maxWidth?: number; maxHeight?: number; maxBytes?: number; format?: "jpeg" | "png"; quality?: number };
export type BrowserScreenshotResult = { mimeType: "image/jpeg" | "image/png"; data: string; width: number; height: number; viewportWidth: number; viewportHeight: number; deviceScaleFactor?: number; coordinateSpace: "css-pixels"; byteLength: number; truncated?: boolean };

export type FsEntry = {
  name: string;
  kind: "dir" | "file";
  size: number;
};

export type FsReadResult = {
  kind: "text" | "image" | "binary" | "tooLarge";
  /** UTF-8 file content when kind is "text". */
  content?: string;
  /** Base64 data URL when kind is "image". */
  dataUrl?: string;
  size: number;
};

/** Bounded in-chat image read. Non-images never include file bytes. */
export type FsImageDataUrlResult = {
  kind: "image" | "missing" | "notImage" | "tooLarge";
  dataUrl?: string;
  size?: number;
  errorCode?: string;
};

export type AgentInstructionFile = {
  scope: "global" | "project";
  path: string;
  content: string;
  exists: boolean;
};

/** Workspace-relative entry of the `fs/index` snapshot for the "@" menu (D124). */
export type FsIndexEntry = {
  path: string;
  kind: "dir" | "file";
};

export type FsIndexResult = {
  entries: FsIndexEntry[];
  /** True when the index hit its entry cap and results were dropped. */
  truncated: boolean;
};

export type TokenUsageBucket = "day" | "week" | "month";

export type TokenUsageHistoryItem = {
  date: string;
  timestamp: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  turnCount: number;
};

export type TokenUsageFacet = {
  id: string;
  label: string;
  turnCount: number;
  totalTokens: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

export type TokenUsageHistoryQuery = {
  startDate?: number;
  endDate?: number;
  /** Restrict results to one conversation session. */
  sessionId?: string;
  bucket?: TokenUsageBucket;
  sources?: string[];
  models?: string[];
  providers?: string[];
  query?: string;
};

export type TokenUsageHistoryResult = {
  bucket: TokenUsageBucket;
  rangeStart: number;
  rangeEnd: number;
  items: TokenUsageHistoryItem[];
  totals: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    reasoningTokens: number;
    turnCount: number;
  };
  facets: {
    sources: TokenUsageFacet[];
    models: TokenUsageFacet[];
    providers: TokenUsageFacet[];
    sessions: TokenUsageFacet[];
  };
  insights: {
    bestDay?: { date: string; timestamp: number; totalTokens: number };
    peakHour?: number;
    streak: { current: number; longest: number };
    milestone?: { value: number; reachedAt: number };
    nextMilestone: { value: number; remaining: number };
  };
};

export type ContextVaultCategory =
  | "architecture"
  | "decisions"
  | "conventions"
  | "gotchas"
  | "notes";

export type ContextVaultEvidence = {
  path: string;
  excerpt: string;
  symbolHint?: string;
  mtimeMs?: number;
};

export type ContextVaultRelationship = {
  type: "supersedes" | "related_to";
  targetId: string;
};

export type ContextVaultClaimInput = {
  claim: string;
  category: ContextVaultCategory;
  impact: string;
  scope: string;
  recheckGuidance: string;
  tags?: string[];
  evidence?: ContextVaultEvidence[];
  verification?: { state: string; note?: string; lastCheckedAt?: number };
  provenance?: { kind: "agent" | "manual" | "user" | "import"; label?: string };
  relationships?: ContextVaultRelationship[];
};

export type ContextVaultClaim = ContextVaultClaimInput & {
  id: string;
  projectPath: string;
  tags: string[];
  evidence: ContextVaultEvidence[];
  verification: { state: string; note?: string; lastCheckedAt?: number };
  freshness: "fresh" | "stale" | "unavailable" | "unverified" | "possibly_stale";
  provenance: { kind: "agent" | "manual" | "user" | "import"; label?: string };
  relationships: ContextVaultRelationship[];
  createdAt: number;
  updatedAt: number;
};

/** User-defined sidebar grouping. Projects remain authoritative by path. */
export type ProjectGroup = {
  id: string;
  name: string;
  projectPaths: string[];
  collapsed: boolean;
  order: number;
};

/** Bounded, project-owned Context Vault projection for prompt assembly. */
export type ProjectMemoryView = {
  projectPath: string;
  claims: ContextVaultClaim[];
  /** Claims are already reviewed, deterministically ordered, and size-bounded. */
  contextText: string;
};

export type ProjectCollection = {
  id: string;
  name: string;
  order: number;
  collapsed: boolean;
};

export type ProjectCollectionMembership = {
  collectionId: string;
  projectPath: string;
  order: number;
};
