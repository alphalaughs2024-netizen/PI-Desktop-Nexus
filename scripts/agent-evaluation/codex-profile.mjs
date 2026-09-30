// Explicit evaluation metadata for a custom provider, using Codex's ModelInfo schema.
// This declares tools to test; it does not claim the provider implements them.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
export async function customCodexCatalog(directory, model) {
  const descriptor = {
    slug: model,
    display_name: model,
    description: 'Nexus custom-provider evaluation',
    default_reasoning_level: null,
    supported_reasoning_levels: [],
    shell_type: 'unified_exec',
    visibility: 'list',
    supported_in_api: true,
    priority: 0,
    availability_nux: null,
    upgrade: null,
    model_messages: {
      instructions_template:
        'You are a coding agent. Inspect inputs, use the available native tools and report errors accurately. Never invent successful actions. Keep work in the supplied evaluation workspace.',
    },
    include_skills_usage_instructions: false,
    include_apps_usage_instructions: false,
    include_plugin_usage_instructions: false,
    supports_reasoning_summary_parameter: false,
    default_reasoning_summary: 'none',
    support_verbosity: false,
    default_verbosity: null,
    apply_patch_tool_type: 'freeform',
    truncation_policy: { mode: 'bytes', limit: 10000 },
    supports_parallel_tool_calls: true,
    context_window: 32768,
    max_context_window: 32768,
    experimental_supported_tools: [],
    input_modalities: ['text', 'image'],
    use_responses_lite: false,
    prefer_websockets: false,
    multi_agent_version: null,
    tool_mode: null,
  };
  const path = join(directory, 'custom-models.json');
  await writeFile(path, JSON.stringify({ models: [descriptor] }, null, 2));
  return {
    path,
    scope:
      'Evaluation-declared native patch and image capabilities; support requires live verification.',
  };
}
