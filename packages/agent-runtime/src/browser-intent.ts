export function browserNavigationIntent(text: string): string | null {
  const value = text.trim();
  const explicit = value.match(/https?:\/\/[^\s"'<>]+/i)?.[0];
  if (explicit) return explicit;
  if (!/\b(open|go to|browse to|navigate to|play|watch|search)\b/i.test(value)) return null;
  if (/\byoutube\b/i.test(value)) return "https://www.youtube.com/";
  if (/\bgithub\b/i.test(value)) return "https://github.com/";
  return null;
}
