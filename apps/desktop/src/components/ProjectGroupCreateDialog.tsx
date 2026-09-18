import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function ProjectGroupCreateDialog({ onClose, onSave, returnFocus }: { onClose: () => void; onSave: (name: string) => void; returnFocus?: HTMLElement | null }) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onClose(); returnFocus?.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, returnFocus]);
  const close = () => { onClose(); returnFocus?.focus(); };
  const dialog = <div className="project-group-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <form className="project-group-modal" role="dialog" aria-modal="true" aria-labelledby="project-group-create-title" onSubmit={(event) => { event.preventDefault(); const value = name.trim(); if (value) { onSave(value); close(); } }}>
      <h2 id="project-group-create-title">Create project group</h2>
      <label>Group name<input ref={inputRef} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
      <footer><button type="button" onClick={close}>Cancel</button><button type="submit" disabled={!name.trim()}>Create</button></footer>
    </form>
  </div>;
  return typeof document === "undefined" ? null : createPortal(dialog, document.body);
}
