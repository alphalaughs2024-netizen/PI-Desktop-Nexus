# ADR 0250: Trusted renderer plugin slots

## Decision

Plugins may declare a self-contained JavaScript ES module in `manifest.renderer` only with the explicit `renderer.extension` permission. This is a high-risk grant. The main process reads at most 1 MiB from a real path inside the loaded plugin directory and sends the source to the desktop renderer. The renderer loads it as a blob module and calls its exported `onLoad(api, React)` function. `onUnload` runs on deactivation. Production CSP permits blob scripts for this purpose while continuing to disallow eval.

The module can register user and assistant message actions, assistant entry extras, cards for its own agent tools, code blocks under its plugin-id language namespace, composer controls, and single-character composer triggers. Trigger suggestions replace the typed token and are bounded to 50 entries. Registrations are disposed when the plugin unloads or its project activation changes. Duplicate keyed registrations are refused.

The renderer API exposes only `composer.insertText` and `plugin.command`, and only when declared in `rendererActions`. The host checks that a dispatched command is registered by the calling plugin. These checks protect the supported API contract; they do not isolate the module. Renderer code runs in the host window and can access the same JavaScript realm as Nexus. Only trusted local code should receive this grant. The existing isolated plugin panels remain the appropriate surface for untrusted UI.

## Consequences

Plugin authors bundle the renderer module without runtime imports. React is provided as the second `onLoad` argument. A missing or invalid module disables only that plugin's renderer slots. Revoking the grant, unloading the plugin, or leaving its activation scope removes its registrations. Nexus owns the surrounding controls and theme tokens; plugins own only their slot content.
