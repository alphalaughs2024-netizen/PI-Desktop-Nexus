import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import type { ThinkingLevel } from "@pi-desktop/shared";
import { REASONING_LABELS, reasoningColors, reasoningIntensity } from "../lib/reasoning-slider";
import sliderLicenseUrl from "../assets/licenses/MuFengThinkingSlider-MIT.txt?no-inline&url";

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
  const particleTarget = useRef({ intensity, color: colors.particleRGB });
  const wakeParticles = useRef<(() => void) | null>(null);
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
    particleTarget.current = { intensity, color: colors.particleRGB };
    wakeParticles.current?.();
  }, [intensity, colors.particleRGB]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let previous = 0;
    let width = 0;
    let height = 0;
    let energy = particleTarget.current.intensity;
    const color = [...particleTarget.current.color];
    // Preserve the particle field across level changes; lifespan fades and
    // eased density follow MuFeng's effect without reseeding on every input.
    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random(), y: Math.random(), size: .7 + Math.random() * 1.35,
      speed: .2 + Math.random() * .8, age: Math.random() * 450, span: 470 + Math.random() * 600,
    }));
    const paint = (now: number) => {
      frame = 0;
      const delta = previous ? Math.min(48, now - previous) : 16.7;
      previous = now;
      const target = particleTarget.current;
      const blend = 1 - Math.exp(-delta / 65);
      energy += (target.intensity - energy) * blend;
      for (let i = 0; i < 3; i++) color[i] += (target.color[i]! - color[i]!) * blend;
      context.clearRect(0, 0, width, height);
      if (target.intensity === 0 && energy < .001) { energy = 0; return; }
      context.fillStyle = context.strokeStyle = `rgb(${color.join(", ")})`;
      const count = energy * 60;
      for (let i = 0; i < particles.length; i++) {
        const particle = particles[i]!;
        particle.x += delta / 1000 * particle.speed * (.08 + energy * .2);
        particle.age += delta;
        if (particle.age > particle.span || particle.x > 1) {
          particle.x = Math.random(); particle.y = Math.random(); particle.age = 0;
        }
        const fade = Math.sin(Math.PI * Math.min(1, particle.age / particle.span));
        context.globalAlpha = fade * (.24 + energy * .5) * Math.max(0, Math.min(1, count - i));
        const x = particle.x * width;
        const y = particle.y * height;
        context.beginPath();
        context.arc(x, y, particle.size * (.8 + energy * .85), 0, Math.PI * 2);
        context.fill();
        if (energy > .55) {
          context.globalAlpha *= (energy - .55) / .45 * .4;
          context.beginPath(); context.moveTo(x - 2 - energy * 3, y); context.lineTo(x, y); context.stroke();
        }
      }
      frame = requestAnimationFrame(paint);
    };
    const wake = () => {
      if (!frame && !reduced.matches && !document.hidden && width > 0 && height > 0 && (particleTarget.current.intensity > 0 || energy > .001)) {
        previous = 0;
        frame = requestAnimationFrame(paint);
      }
    };
    const restart = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      wake();
    };
    wakeParticles.current = wake;
    const observer = new ResizeObserver(restart);
    observer.observe(canvas);
    reduced.addEventListener("change", restart);
    document.addEventListener("visibilitychange", restart);
    restart();
    return () => {
      cancelAnimationFrame(frame);
      wakeParticles.current = null;
      observer.disconnect();
      reduced.removeEventListener("change", restart);
      document.removeEventListener("visibilitychange", restart);
      context.clearRect(0, 0, width, height);
    };
  }, []);

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

  return <section className="reasoning-slider" aria-label="Reasoning settings" aria-busy={saving} data-license={sliderLicenseUrl} style={{
    "--reasoning-from": colors.from, "--reasoning-to": colors.to,
    "--reasoning-text": colors.text, "--reasoning-fill": level === "off" ? "0px" : `calc(11px + (100% - 22px) * ${fraction})`,
    "--reasoning-position": `calc(11px + (100% - 22px) * ${fraction})`,
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
      <div className="reasoning-thumb" aria-hidden="true" />
    </div>
    <div className="reasoning-captions">{levels.map((option) => <button type="button" key={option} className={option === level ? "is-selected" : ""} disabled={locked} aria-label={`Set reasoning to ${REASONING_LABELS[option]}`} aria-pressed={option === level} onClick={() => void commit(option)}>{REASONING_LABELS[option]}</button>)}</div>
    {levels.length < 2 ? <div className="reasoning-unavailable">{level === "off" ? "Reasoning unavailable for this model" : "Fixed reasoning level"}</div> : null}
  </section>;
}
