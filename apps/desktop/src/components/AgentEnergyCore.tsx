import { useId, type CSSProperties } from "react";
import type { WorkflowCoreState } from "../lib/workflow-agent-activity";

const RIBBON = "M8 21 C8 6 22 5 25 15 C29 26 14 34 9 24 C6 18 13 10 21 15 C29 20 28 31 18 31";
const HIGHLIGHT = "M13 10 C24 3 34 17 24 26 C14 35 6 27 10 19 C14 12 24 11 28 20";

export function AgentEnergyCore({ state, turnId }: { state: WorkflowCoreState; turnId?: string }) {
  const id = useId().replaceAll(":", "");
  const gradient = `energy-${id}`;
  const bloom = `energy-bloom-${id}`;
  return <svg className="agent-energy-core" data-state={state} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="var(--energy-blue)" />
        <stop offset=".45" stopColor="var(--energy-highlight)" />
        <stop offset=".72" stopColor="var(--energy-violet)" />
        <stop offset="1" stopColor="var(--energy-blue)" />
      </linearGradient>
      <filter id={bloom} x="-75%" y="-75%" width="250%" height="250%">
        <feGaussianBlur stdDeviation="1.9" />
      </filter>
    </defs>
    <g className="agent-energy-flow" key={`${state}:${turnId ?? "none"}`} fill="none" stroke={`url(#${gradient})`} strokeLinecap="round" strokeLinejoin="round">
      <g className="agent-energy-bloom" filter={`url(#${bloom})`} strokeWidth="3.3">
        <path d={RIBBON} /><path d={HIGHLIGHT} />
      </g>
      <path d={RIBBON} strokeWidth="1.8" />
      <path className="agent-energy-highlight" d={HIGHLIGHT} strokeWidth="1" />
    </g>
  </svg>;
}

export function WorkflowPillLight() {
  const id = useId().replaceAll(":", "");
  const gradient = `pill-light-${id}`;
  const bloom = `pill-bloom-${id}`;
  const caustic = `pill-caustic-${id}`;
  const particles = [
    ["5%", "-13px"], ["11%", "-6px"], ["18%", "-18px"], ["-10px", "20px"], ["26%", "-8px"],
    ["75%", "calc(100% + 8px)"], ["83%", "calc(100% + 18px)"], ["92%", "calc(100% + 7px)"],
    ["calc(100% + 10px)", "calc(100% - 14px)"], ["66%", "calc(100% + 15px)"],
  ];
  return <>
    <div className="active-workflow-aura" aria-hidden="true">
      {particles.map(([left, top], index) => <span key={index} className="active-workflow-particle"
        style={{ left, top, "--particle-delay": `${index * -0.47}s`, "--particle-size": `${index % 3 === 0 ? 2 : 1.5}px` } as CSSProperties} />)}
    </div>
    <svg className="active-workflow-light" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="var(--workflow-light-highlight)" stopOpacity=".85" />
        <stop offset=".25" stopColor="var(--workflow-light)" stopOpacity=".16" />
        <stop offset=".68" stopColor="var(--workflow-light)" stopOpacity=".03" />
        <stop offset="1" stopColor="var(--workflow-light-highlight)" stopOpacity=".8" />
      </linearGradient>
      <filter id={bloom} x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation="7" /></filter>
      <filter id={caustic} x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation="2.4" /></filter>
    </defs>
    <rect className="active-workflow-bloom" stroke={`url(#${gradient})`} filter={`url(#${bloom})`} />
    <rect className="active-workflow-caustic" stroke={`url(#${gradient})`} filter={`url(#${caustic})`} />
    <rect className="active-workflow-orbit" pathLength="1" filter={`url(#${bloom})`} />
    </svg>
  </>;
}
