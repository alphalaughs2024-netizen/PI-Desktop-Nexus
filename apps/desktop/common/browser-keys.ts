const namedKeys = new Map([
  "Enter", "Tab", "Escape", "Backspace", "Delete", "Insert", "ArrowLeft", "ArrowUp",
  "ArrowRight", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Space",
  "Alt", "Control", "Meta", "Shift", "ControlOrMeta",
].map(key => [key.toLowerCase(), key]));
namedKeys.set("return", "Enter");
namedKeys.set("esc", "Escape");
namedKeys.set("ctrl", "Control");
namedKeys.set("cmd", "Meta");
namedKeys.set("command", "Meta");

export function normalizeBrowserKey(key: string): string {
  if (key === " ") return "Space";
  return namedKeys.get(key.toLowerCase()) ?? key;
}

export function normalizeBrowserChord(key: string): string {
  return key.split("+").map(normalizeBrowserKey).join("+");
}
