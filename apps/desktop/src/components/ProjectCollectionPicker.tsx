import { useEffect, useRef, useState } from "react";
import type { ProjectCollection } from "@pi-desktop/shared";

export type CollectionProjectOption = { path: string; name: string };
type Props = { projectPath?: string; collections: ProjectCollection[]; selected: string[]; onClose: () => void; onToggle: (id: string, checked: boolean) => void; onCreate: (name: string) => void; projects?: CollectionProjectOption[]; assignmentCollectionId?: string; onAssign?: (projectPath: string, checked: boolean) => void; anchor?: { top: number; left: number } };

export function ProjectCollectionPicker({ projectPath, collections, selected, onClose, onToggle, onCreate, projects = [], assignmentCollectionId, onAssign, anchor }: Props) {
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const firstControl = useRef<HTMLInputElement>(null);
  const assignmentCollection = assignmentCollectionId ? collections.find((collection) => collection.id === assignmentCollectionId) : undefined;
  const visibleCollections = collections.filter((collection) => collection.name.toLowerCase().includes(query.toLowerCase()));
  const visibleProjects = projects.filter((project) => project.name.toLowerCase().includes(query.toLowerCase()) || project.path.toLowerCase().includes(query.toLowerCase()));
  useEffect(() => { firstControl.current?.focus(); const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, [onClose]);
  return <section className="collection-picker-popover" role="dialog" aria-modal="true" aria-labelledby="project-collection-picker-title" style={anchor ? { top: anchor.top, left: anchor.left } : undefined}>
    <header className="collection-picker-header"><div><h2 id="project-collection-picker-title">{assignmentCollection ? `Add projects to ${assignmentCollection.name}` : "Organize project"}</h2><p>{assignmentCollection ? "Choose which projects belong to this group." : "Manage collections"}</p><p className="sr-only">{projectPath}</p></div><button type="button" className="collection-picker-close" aria-label="Close" onClick={onClose}>×</button></header>
    <input ref={firstControl} aria-label={assignmentCollection ? "Search projects" : "Search project groups"} placeholder={assignmentCollection ? "Search projects" : "Search project groups"} value={query} onChange={(event) => setQuery(event.target.value)} />
    {assignmentCollection ? <div className="project-collection-options">{visibleProjects.map((project) => <label key={project.path} className="project-collection-project"><input type="checkbox" checked={selected.includes(project.path)} onChange={(event) => onAssign?.(project.path, event.target.checked)} /><span>{project.name}</span><small>{project.path}</small></label>)}{visibleProjects.length === 0 ? <p className="collection-picker-empty">No projects found.</p> : null}</div> : <div className="project-collection-options">{visibleCollections.map((collection) => <label key={collection.id}><input type="checkbox" checked={selected.includes(collection.id)} onChange={(event) => onToggle(collection.id, event.target.checked)} /><span>{collection.name}</span></label>)}{visibleCollections.length === 0 ? <p className="collection-picker-empty">No project groups found.</p> : null}</div>}
    {!assignmentCollection ? <form className="collection-picker-create" onSubmit={(event) => { event.preventDefault(); const value = newName.trim(); if (value) { onCreate(value); setNewName(""); } }}><input aria-label="New project group" placeholder="New project group" value={newName} onChange={(event) => setNewName(event.target.value)} /><button type="submit" disabled={!newName.trim()}>Create project group</button></form> : null}
    <footer><button type="button" onClick={onClose}>Done</button></footer>
  </section>;
}
