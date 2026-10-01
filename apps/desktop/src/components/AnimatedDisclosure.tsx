import { useEffect, useState, type ReactNode } from "react";

const COLLAPSE_RETENTION_MS = 200;

/** Keep closing content alive until the 180ms transition has settled. */
export function AnimatedDisclosure({ open, id, children }: {
  open: boolean;
  id: string;
  children: () => ReactNode;
}) {
  const [retained, setRetained] = useState(open);
  useEffect(() => {
    if (open) {
      setRetained(true);
      return;
    }
    if (!retained) return;
    const timer = window.setTimeout(() => setRetained(false), COLLAPSE_RETENTION_MS);
    return () => window.clearTimeout(timer);
  }, [open, retained]);
  return <div id={id} className={`activity-disclosure${open ? " is-open" : ""}`} inert={!open} aria-hidden={!open}>
    <div className="activity-disclosure-inner">{open || retained ? children() : null}</div>
  </div>;
}
