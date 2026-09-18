import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ProjectCollection } from "@pi-desktop/shared";
import { placeProjectCollectionPicker, type ProjectCollectionPickerPlacement } from "../lib/project-collection-picker-position";

export type CollectionProjectOption = { path: string; name: string };
type Props = {
  projectPath?: string;
  collections: ProjectCollection[];
  selected: string[];
  onClose: () => void;
  onToggle: (id: string, checked: boolean) => void;
  onCreate: (name: string) => void;
  projects?: CollectionProjectOption[];
  assignmentCollectionId?: string;
  onAssign?: (projectPath: string, checked: boolean) => void;
  anchor?: HTMLElement | null;
};

export function ProjectCollectionPicker({ projectPath, collections, selected, onClose, onToggle, onCreate, projects = [], assignmentCollectionId, onAssign, anchor }: Props) {
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [placement, setPlacement] = useState<ProjectCollectionPickerPlacement | null>(null);
  const firstControl = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const assignmentCollection = assignmentCollectionId ? collections.find((collection) => collection.id === assignmentCollectionId) : undefined;
  const visibleCollections = collections.filter((collection) => collection.name.toLowerCase().includes(query.toLowerCase()));
  const visibleProjects = projects.filter((project) => project.name.toLowerCase().includes(query.toLowerCase()) || project.path.toLowerCase().includes(query.toLowerCase()));

  const updatePlacement = useCallback(() => {
    if (!anchor || !panelRef.current) return;
    const anchorRect = anchor.getBoundingClientRect();
    const panelRect = panelRef.current.getBoundingClientRect();
    setPlacement(placeProjectCollectionPicker({
      anchor: anchorRect,
      panel: { width: panelRect.width, height: panelRect.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      protected: { top: 46, right: 8, bottom: 24, left: 8 },
    }));
  }, [anchor]);

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(updatePlacement);
    return () => window.cancelAnimationFrame(frame);
  }, [updatePlacement, query, assignmentCollectionId, collections.length, projects.length]);

  useEffect(() => {
    firstControl.current?.focus();
    const closeAndRestore = () => { onClose(); anchor?.focus(); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") closeAndRestore(); };
    const onPointerDown = (event: PointerEvent) => { if (panelRef.current && !panelRef.current.contains(event.target as Node)) closeAndRestore(); };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updatePlacement);
    if (observer) {
      observer.observe(panelRef.current!);
      if (anchor) observer.observe(anchor);
      const pane = document.querySelector(".main-pane");
      if (pane) observer.observe(pane);
    }
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
      observer?.disconnect();
    };
  }, [anchor, onClose, updatePlacement]);

  const panel = <section ref={panelRef} className="collection-picker-popover" role="dialog" aria-labelledby="project-collection-picker-title" style={placement ? { top: `${placement.top}px`, left: `${placement.left}px` } : undefined}>
    <header className="collection-picker-header"><div><h2 id="project-collection-picker-title">{assignmentCollection ? `Add projects to ${assignmentCollection.name}` : "Organize project"}</h2><p>{assignmentCollection ? "Choose which projects belong to this group." : "Manage collections"}</p><p className="sr-only">{projectPath}</p></div><button type="button" className="collection-picker-close" aria-label="Close" onClick={onClose}>×</button></header>
    <input ref={firstControl} aria-label={assignmentCollection ? "Search projects" : "Search project groups"} placeholder={assignmentCollection ? "Search projects" : "Search project groups"} value={query} onChange={(event) => setQuery(event.target.value)} />
    {assignmentCollection ? <div className="project-collection-options">{visibleProjects.map((project) => <label key={project.path} className="project-collection-project"><input type="checkbox" checked={selected.includes(project.path)} onChange={(event) => onAssign?.(project.path, event.target.checked)} /><span>{project.name}</span><small>{project.path}</small></label>)}{visibleProjects.length === 0 ? <p className="collection-picker-empty">No projects found.</p> : null}</div> : <div className="project-collection-options">{visibleCollections.map((collection) => <label key={collection.id}><input type="checkbox" checked={selected.includes(collection.id)} onChange={(event) => onToggle(collection.id, event.target.checked)} /><span>{collection.name}</span></label>)}{visibleCollections.length === 0 ? <p className="collection-picker-empty">No project groups found.</p> : null}</div>}
    {!assignmentCollection ? <form className="collection-picker-create" onSubmit={(event) => { event.preventDefault(); const value = newName.trim(); if (value) { onCreate(value); setNewName(""); } }}><input aria-label="New project group" placeholder="New project group" value={newName} onChange={(event) => setNewName(event.target.value)} /><button type="submit" disabled={!newName.trim()}>Create project group</button></form> : null}
    <footer><button type="button" onClick={onClose}>Done</button></footer>
  </section>;
  return typeof document === "undefined" ? null : createPortal(panel, document.body);
}
