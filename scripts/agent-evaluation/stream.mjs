// Incremental SSE decoding shared by provider and engine probes.
export async function* jsonEvents(body, { maxFrameBytes = 2 * 1024 * 1024 } = {}) {
  const decoder = new TextDecoder();
  let buffer = '';
  const frames = function* () {
    let match;
    while ((match = /\r?\n\r?\n/.exec(buffer))) {
      const frame = buffer.slice(0, match.index);
      if (Buffer.byteLength(frame) > maxFrameBytes) throw new Error('SSE_FRAME_TOO_LARGE');
      buffer = buffer.slice(match.index + match[0].length);
      const data = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (!data || data === '[DONE]') continue;
      try {
        yield JSON.parse(data);
      } catch {
        throw new Error('INVALID_SSE_JSON');
      }
    }
  };
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    yield* frames();
    if (Buffer.byteLength(buffer) > maxFrameBytes) throw new Error('SSE_FRAME_TOO_LARGE');
  }
  buffer += decoder.decode();
  yield* frames();
  if (buffer.trim()) throw new Error('TRUNCATED_SSE_FRAME');
}
