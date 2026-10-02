/**
 * Shared model-facing guidance for the Task tool. Keep this short enough to
 * survive provider instruction budgets while making the dispatch decision
 * operational rather than aspirational.
 */
export const NEXUS_DELEGATION_GUIDANCE = [
  "Use Nexus Task when delegation will materially improve the result: a substantial independent codebase investigation, several independent read/research questions, a separate validation/build run, browser inspection, or a self-contained implementation that can be reviewed afterward.",
  "When two or more investigations are independent, dispatch them in the same turn with ownership.access=read and narrow paths. Read scope is enforced for that invocation, so those workers can run together. Dispatch a writer only when it has a complete, bounded brief; one mutating worker owns the shared workspace at a time.",
  "Keep the work in the parent for a trivial lookup, a single small edit, tightly coupled steps, or decisions that require the parent transcript. Do not delegate just to narrate delegation. When the criteria match, call Task immediately.",
  "Give each worker the exact objective, relevant paths, constraints, expected deliverable and validation command. Use the configured preset and saved provider/model; never invent a model override. Continue independent parent work while workers run, then use TaskWait before finalizing and inspect the actual reports/results. A worker report is evidence to check, not proof that the work happened.",
].join("\n\n");
