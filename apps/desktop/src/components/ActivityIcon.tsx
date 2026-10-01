import { useLayoutEffect, useRef } from "react";
import motionLicenseUrl from "../assets/licenses/LucideAnimated-MIT.txt?no-inline&url";
import type { ActivityIconKind } from "../lib/activity-motion";
import {
  IconBrain, IconCircleAlert, IconCircleCheck, IconFileText, IconFolder,
  IconGitBranch, IconGlobe, IconLoaderCircle, IconPause, IconPencil,
  IconSearch, IconTerminal, IconWrench,
} from "./icons";

const ICONS = {
  terminal: IconTerminal, search: IconSearch, delegate: IconGitBranch,
  completed: IconCircleCheck, reasoning: IconBrain, waiting: IconLoaderCircle,
  paused: IconPause, failed: IconCircleAlert, file: IconFileText,
  folder: IconFolder, edit: IconPencil, web: IconGlobe, tool: IconWrench,
};


export function ActivityIcon({ kind, animate = false, size = 15 }: {
  kind: ActivityIconKind;
  animate?: boolean;
  size?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const Icon = ICONS[kind];
  useLayoutEffect(() => {
    // Normalize Lucide geometry for stroke draws without duplicating its SVGs.
    ref.current?.querySelectorAll("path, line, circle, polyline").forEach(node => {
      node.setAttribute("pathLength", "1");
    });
  }, [kind]);
  return <span ref={ref} className={`activity-icon activity-icon-${kind}${animate ? " is-animated" : ""}`} data-motion-license={motionLicenseUrl} aria-hidden="true">
    <Icon size={size} strokeWidth={2} />
  </span>;
}
