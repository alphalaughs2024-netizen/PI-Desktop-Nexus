import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import type { ThinkingLevel } from "@pi-desktop/shared";
import { REASONING_LABELS, reasoningColors, reasoningIntensity } from "../lib/reasoning-slider";

interface Props {
  levels: ThinkingLevel[];
  value: ThinkingLevel;
  defaultValue: ThinkingLevel;
  modelLabel: string;
  disabled: boolean;
  onModel: () => void;
  onSelect: (level: ThinkingLevel) => Promise<void>;
}

export function ReasoningSlider({ levels, value, defaultValue, modelLabel, disabled, onModel, onSelect }: Props) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rangeRef = useRef<HTMLInputElement>(null);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.scenicTheme || (document.documentElement.dataset.theme === "light" ? "alpine-light" : "twilight-mountains"));
  const selected = Math.max(0, levels.indexOf(draft));
  const level = levels[selected] ?? "off";
  const fraction = levels.length > 1 ? selected / (levels.length - 1) : (level === "off" ? 0 : 1);
  const intensity = reasoningIntensity(levels, selected);
  const colors = reasoningColors(theme, intensity);
  // Keep the native range focused during saves; blocking events avoids a
  // Chromium key-event interruption caused by disabling the focused input.
  const locked = disabled || saving || levels.length < 2;

  useEffect(() => { setDraft(value); }, [value, levels.join("|")]);
  useEffect(() => { rangeRef.current?.focus(); }, []);
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setTheme(root.dataset.scenicTheme || (root.dataset.theme === "light" ? "alpine-light" : "twilight-mountains"));
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme", "data-scenic-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let previous = 0;
    let width = 0;
    let height = 0;
    const particles = Array.from({ length: Math.round(12 + intensity * 48) }, () => ({ x: Math.random(), y: Math.random(), size: .6 + Math.random() * .8, speed: .2 + Math.random() * .8 }));
    const paint = (now: number) => {
      const delta = previous ? Math.min(40, now - previous) / 1000 : 0;
      previous = now;
      context.clearRect(0, 0, width, height);
      context.fillStyle = colors.particle;
      for (const particle of particles) {
        particle.x = (particle.x + delta * particle.speed * (.08 + intensity * .2)) % 1;
        context.globalAlpha = .4 + particle.speed * .55;
        context.beginPath();
        context.ellipse(particle.x * width, particle.y * height, particle.size * (1 + intensity), particle.size, 0, 0, Math.PI * 2);
        context.fill();
      }
      frame = requestAnimationFrame(paint);
    };
    const restart = () => {
      cancelAnimationFrame(frame);
      previous = 0;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (intensity > 0 && !reduced.matches && !document.hidden && width > 0) frame = requestAnimationFrame(paint);
    };
    const observer = new ResizeObserver(restart);
    observer.observe(canvas);
    reduced.addEventListener("change", restart);
    document.addEventListener("visibilitychange", restart);
    restart();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      reduced.removeEventListener("change", restart);
      document.removeEventListener("visibilitychange", restart);
      context.clearRect(0, 0, width, height);
    };
  }, [colors.particle, intensity]);

  const commit = async (next: ThinkingLevel) => {
    if (disabled || busy.current || !levels.includes(next) || next === value) return;
    busy.current = true;
    setSaving(true);
    setDraft(next);
    try { await onSelect(next); }
    catch { setDraft(value); }
    finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return <section className="reasoning-slider" aria-label="Reasoning settings" aria-busy={saving} style={{
    "--reasoning-from": colors.from, "--reasoning-to": colors.to,
    "--reasoning-text": colors.text, "--reasoning-fill": level === "off" ? "0px" : `calc(11px + (100% - 22px) * ${fraction})`,
  } as CSSProperties}>
    <div className="reasoning-slider-heading">
      <span id={`${id}-label`}>Reasoning <strong>{REASONING_LABELS[level]}</strong></span>
      <button type="button" className="reasoning-reset" aria-label="Reset reasoning to model default" title={`Reset to ${REASONING_LABELS[defaultValue]}`} disabled={locked || level === defaultValue} onClick={() => void commit(defaultValue)}><RotateCcw size={14} /></button>
    </div>
    <button type="button" className="reasoning-model" disabled={disabled || saving} onClick={onModel} title={modelLabel}><span>{modelLabel}</span><ChevronDown size={12} /></button>
    <div className="reasoning-range">
      <div className="reasoning-rail" aria-hidden="true"><div className="reasoning-fill"><canvas ref={canvasRef} /></div></div>
      <input ref={rangeRef} type="range" min={0} max={Math.max(0, levels.length - 1)} step={1} value={selected} disabled={disabled || levels.length < 2} aria-disabled={locked} aria-labelledby={`${id}-label`} aria-valuetext={REASONING_LABELS[level]} onChange={(event) => {
        if (!locked) setDraft(levels[Number(event.target.value)] ?? value);
      }} onPointerDown={(event) => {
        if (locked) event.preventDefault();
        else event.currentTarget.setPointerCapture(event.pointerId);
      }} onKeyDown={(event) => {
        if (saving && event.key !== "Escape" && event.key !== "Tab") event.preventDefault();
      }} onPointerUp={(event) => void commit(levels[Number(event.currentTarget.value)] ?? value)} onPointerCancel={() => setDraft(value)} onBlur={() => void commit(level)} onKeyUp={(event) => {
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) void commit(levels[Number(event.currentTarget.value)] ?? value);
      }} />
    </div>
    <div className="reasoning-captions">{levels.map((option) => <button type="button" key={option} className={option === level ? "is-selected" : ""} disabled={locked} aria-label={`Set reasoning to ${REASONING_LABELS[option]}`} aria-pressed={option === level} onClick={() => void commit(option)}>{REASONING_LABELS[option]}</button>)}</div>
    {levels.length < 2 ? <div className="reasoning-unavailable">{level === "off" ? "Reasoning unavailable for this model" : "Fixed reasoning level"}</div> : null}
  </section>;
}
