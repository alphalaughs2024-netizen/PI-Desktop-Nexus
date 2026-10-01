import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { WorkPanelPresentation } from "./work-panel-presentation";
import { setBrowserComposerBlocked } from "./browser-composer-bridge";

export function useBrowserPresentationMotion(elementRef: RefObject<HTMLElement | null>, enabled: boolean, presentation: WorkPanelPresentation): boolean {
  const previous = useRef<{ presentation: WorkPanelPresentation; rect: DOMRect } | null>(null);
  const active = useRef<Animation | null>(null);
  const [moving, setMoving] = useState(false);
  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element || !enabled) { previous.current = null; return; }
    const before = previous.current;
    // Full view disables the mount animation; returning must not start it again.
    if (before && before.presentation !== presentation) element.dataset.browserPresentationMotion = "settled";
    const target = element.getBoundingClientRect();
    previous.current = { presentation, rect: target };
    let restore: ((interrupted?: boolean) => void) | undefined;
    if (before && before.presentation !== presentation && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const keys = ["position", "inset", "left", "top", "width", "height", "zIndex", "animation", "transform"] as const;
      const saved = Object.fromEntries(keys.map(key => [key, element.style[key]]));
      Object.assign(element.style, { position: "fixed", inset: "auto", left: `${target.left}px`, top: `${target.top}px`, width: `${target.width}px`, height: `${target.height}px`, zIndex: "40", animation: "none", transform: "none" });
      setBrowserComposerBlocked("presentation", true);
      setMoving(true);
      const geometry = (rect: DOMRect) => ({ left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      const animation = element.animate([geometry(before.rect), geometry(target)], { duration: 300, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
      active.current = animation;
      let restored = false;
      restore = (interrupted = false) => {
        if (restored) return;
        restored = true;
        const visibleRect = element.getBoundingClientRect();
        animation.cancel();
        for (const key of keys) element.style[key] = saved[key];
        active.current = null;
        previous.current = { presentation, rect: interrupted ? visibleRect : element.getBoundingClientRect() };
        setBrowserComposerBlocked("presentation", false);
        setMoving(false);
      };
      void animation.finished.then(() => restore?.(), () => restore?.());
    }
    const observer = new ResizeObserver(() => { if (!active.current) previous.current = { presentation, rect: element.getBoundingClientRect() }; });
    observer.observe(element);
    const resize = () => restore?.();
    window.addEventListener("resize", resize);
    return () => { observer.disconnect(); window.removeEventListener("resize", resize); restore?.(true); };
  }, [enabled, presentation, elementRef]);
  return moving;
}
