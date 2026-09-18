import type { ChangelogEntry } from "./changelog.js";

export const deEntries: ChangelogEntry[] = [{
  version: "0.0.4",
  date: "2026-09-18",
  highlights: [
    "Fügt einen ausdrücklich bestätigten Vollzugriffsmodus für vertrauenswürdige Agent-Sitzungen hinzu und bewahrt die Host-Sicherheitsregeln.",
    "Fügt die Datenbankschema-Migration von v16 auf v17 mit Sicherung hinzu und erhält Sitzungen, Transkripte und Indizes.",
    "Behebt die Startkompatibilität mit Daten aus dem experimentellen Vollzugriffs-Build.",
  ],
}, {
  version: "0.0.3",
  date: "2026-09-18",
  highlights: [
    "Reduziert die Einrückung der Seitenleiste und bewahrt Hierarchie, Fokus, Themen und Ablageanzeigen.",
    "Fügt Projektgruppen, persistente Sortierung, Mehrfachzuordnung, projektspezifischen Speicher und verankerte Verwaltungsflächen hinzu.",
    "Fügt sichere Projekt- und Sitzungsorganisation per Drag-and-drop hinzu, einschließlich Bestätigung für nicht leere Sitzungen und Schutz laufender Sitzungen.",
    "Entfernt dauerhaft eingeblendete Projekttooltips, die die Seitenleiste verdeckten.",
    "Bewahrt Sitzungs-IDs und Transkripte beim Wechsel des Projektkontexts.",
  ],
}, {
  version: "0.0.2",
  date: "2026-09-18",
  highlights: ["Zeigt bei Update-Fehlern verständliche Hinweise an und bewahrt Diagnosedetails in lokalen Protokollen."],
}, {
  version: "0.0.1",
  date: "2026-09-17",
  highlights: ["Etabliert PI Desktop Nexus als unabhängigen lokalen KI-Programmierarbeitsbereich mit verwalteten Arbeitsbereichen, Workflow-Paketen, Context Vault und Landschaftsthemen."],
}];
