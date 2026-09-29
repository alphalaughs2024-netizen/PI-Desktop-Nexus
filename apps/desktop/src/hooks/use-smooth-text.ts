import { useEffect, useRef, useState } from "react";

/** Reveal streamed text at a bounded frame rate, catching up within about 500ms. */
export function useSmoothText(source: string, streaming: boolean): string {
  const [length, setLength] = useState(source.length);
  const revealed = useRef(source.length);
  const lastFrame = useRef(0);

  useEffect(() => {
    if (!streaming) {
      revealed.current = source.length;
      setLength(source.length);
      lastFrame.current = 0;
      return;
    }
    let frame = 0;
    const tick = (now: number) => {
      const backlog = source.length - revealed.current;
      if (backlog <= 0) return;
      const elapsed = lastFrame.current ? now - lastFrame.current : 1000 / 60;
      if (elapsed >= 1000 / 60) {
        lastFrame.current = now;
        const rate = Math.max(60, backlog * 2);
        revealed.current = Math.min(source.length, revealed.current + Math.max(1, Math.floor(rate * Math.min(elapsed, 100) / 1000)));
        setLength(revealed.current);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [source, streaming]);

  if (!streaming) return source;
  let end = Math.min(length, source.length);
  if (end > 0 && end < source.length) {
    const code = source.charCodeAt(end - 1);
    if (code >= 0xd800 && code <= 0xdbff) end += 1;
  }
  return source.slice(0, end);
}
