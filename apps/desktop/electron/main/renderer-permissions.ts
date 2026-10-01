export function rendererPermissionAllowed(
  rendererId: number,
  requesterId: number | undefined,
  permission: string,
  details: unknown,
  stage: "request" | "check",
): boolean {
  if (requesterId !== rendererId) return false;
  if (permission === "clipboard-sanitized-write") return true;
  if (permission !== "media") return false;
  if (!details || typeof details !== "object") return false;
  return stage === "check"
    ? "mediaType" in details && details.mediaType === "audio"
    : "mediaTypes" in details && Array.isArray(details.mediaTypes) && details.mediaTypes.length === 1 && details.mediaTypes[0] === "audio";
}
