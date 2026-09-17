import { useState } from "react";
import type { ProjectCollection } from "@pi-desktop/shared";

export function ProjectCollectionPicker({ projectPath, collections, selected, onClose, onToggle, onCreate }: { projectPath: string; collections: ProjectCollection[]; selected: string[]; onClose: () => void; onToggle: (id: string, checked: boolean) => void; onCreate: (name: string) => void }) {
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const visible = collections.filter((collection) => collection.name.toLowerCase().includes(query.toLowerCase()));
  return <div className="project-group-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="project-group-modal" role="dialog" aria-modal="true" aria-labelledby="project-collection-picker-title">
      <h2 id="project-collection-picker-title">Manage collections</h2>
      <p>{projectPath}</p>
      <input aria-label="Search collections" placeholder="Search collections" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="project-collection-options">{visible.map((collection) => <label key={collection.id}><input type="checkbox" checked={selected.includes(collection.id)} onChange={(event) => onToggle(collection.id, event.target.checked)} />{collection.name}</label>)}</div>
      <form onSubmit={(event) => { event.preventDefault(); const value = newName.trim(); if (value) { onCreate(value); setNewName(""); } }}><input aria-label="New collection name" placeholder="New collection" value={newName} onChange={(event) => setNewName(event.target.value)} /><button type="submit" disabled={!newName.trim()}>Add</button></form>
      <footer><button type="button" onClick={onClose}>Done</button></footer>
    </section>
  </div>;
}
