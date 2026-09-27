export function browserSurfaceSessionUpdate(
  ownerSessionId: string | undefined,
  sessionId: string | undefined,
  visible: boolean,
): { accept: boolean; ownerSessionId: string | undefined } {
  if (!visible && sessionId && ownerSessionId && sessionId !== ownerSessionId) {
    return { accept: false, ownerSessionId };
  }
  return { accept: true, ownerSessionId: visible && sessionId ? sessionId : ownerSessionId };
}
