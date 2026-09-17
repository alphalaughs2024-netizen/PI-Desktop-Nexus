import { useState } from "react";

export function ProjectGroupCreateDialog({ onClose, onSave }: { onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState("");
  return <div className="project-group-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="project-group-modal" role="dialog" aria-modal="true" aria-labelledby="project-group-create-title" onSubmit={(event) => { event.preventDefault(); const value = name.trim(); if (value) { onSave(value); onClose(); } }}>
      <h2 id="project-group-create-title">Create project group</h2>
      <label>Group name<input autoFocus value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
      <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={!name.trim()}>Create</button></footer>
    </form>
  </div>;
}
