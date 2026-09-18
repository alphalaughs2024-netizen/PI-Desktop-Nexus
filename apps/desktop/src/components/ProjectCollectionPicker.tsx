import { useState } from "react";
import type { ProjectCollection } from "@pi-desktop/shared";

export type CollectionProjectOption = { path: string; name: string };

export function ProjectCollectionPicker({ projectPath, collections, selected, onClose, onToggle, onCreate, projects = [], assignmentCollectionId, onAssign }: { projectPath?: string; collections: ProjectCollection[]; selected: string[]; onClose: () => void; onToggle: (id: string, checked: boolean) => void; onCreate: (name: string) => void; projects?: CollectionProjectOption[]; assignmentCollectionId?: string; onAssign?: (projectPath: string, checked: boolean) => void }) {
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const visible = collections.filter((collection) => collection.name.toLowerCase().includes(query.toLowerCase()));
  const visibleProjects = projects.filter((project) => project.name.toLowerCase().includes(query.toLowerCase()) || project.path.toLowerCase().includes(query.toLowerCase()));
  const assignmentCollection = assignmentCollectionId ? collections.find((collection) => collection.id === assignmentCollectionId) : undefined;
  return <div className="project-group-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="project-group-modal" role="dialog" aria-modal="true" aria-labelledby="project-collection-picker-title">
      <h2 id="project-collection-picker-title">{assignmentCollection ? `Add projects to ${assignmentCollection.name}` : "Manage collections"}</h2>
      {assignmentCollection ? <p>Select the projects that belong to this collection.</p> : <p>{projectPath}</p>}
      <input aria-label={assignmentCollection ? "Search projects" : "Search collections"} placeholder={assignmentCollection ? "Search projects" : "Search collections"} value={query} onChange={(event) => setQuery(event.target.value)} />
      {assignmentCollection ? <div className="project-collection-options">{visibleProjects.map((project) => <label key={project.path} className="project-collection-project"><input type="checkbox" checked={selected.includes(project.path)} onChange={(event) => onAssign?.(project.path, event.target.checked)} />{project.name}</label>)}</div> : <div className="project-collection-options">{visible.map((collection) => <label key={collection.id}><input type="checkbox" checked={selected.includes(collection.id)} onChange={(event) => onToggle(collection.id, event.target.checked)} />{collection.name}</label>)}</div>}
      {!assignmentCollection ? <form onSubmit={(event) => { event.preventDefault(); const value = newName.trim(); if (value) { onCreate(value); setNewName(""); } }}><input aria-label="New collection name" placeholder="New collection" value={newName} onChange={(event) => setNewName(event.target.value)} /><button type="submit" disabled={!newName.trim()}>Add</button></form> : null}
      <footer><button type="button" onClick={onClose}>Done</button></footer>
    </section>
  </div>;
}
