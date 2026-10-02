import { cx } from "../ui";

/** Aceternity-inspired edge light; the parent keeps its surface and controls. */
export function HoverBorderGradient({ className }: { className?: string }) {
  return (
    <span className={cx("hover-border-gradient", className)} aria-hidden="true">
      <span className="hover-border-gradient-sweep" />
      <span className="hover-border-gradient-highlight" />
      <span className="hover-border-gradient-bloom" />
    </span>
  );
}
