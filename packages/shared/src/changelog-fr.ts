import type { ChangelogEntry } from "./changelog.js";

export const frEntries: ChangelogEntry[] = [{
  version: "0.0.4",
  date: "2026-09-18",
  highlights: [
    "Ajoute un mode d’accès total avec confirmation explicite pour les sessions Agent de confiance tout en conservant les restrictions de sécurité de l’hôte.",
    "Ajoute la migration du schéma de base de données v16 vers v17 avec sauvegarde, en conservant sessions, transcriptions et index.",
    "Corrige la compatibilité au démarrage avec les données créées par le build expérimental d’accès total.",
  ],
}, {
  version: "0.0.3",
  date: "2026-09-18",
  highlights: [
    "Réduit l’indentation de la barre latérale tout en conservant la hiérarchie, le focus, les thèmes et les indicateurs de dépôt.",
    "Ajoute les groupes de projets, le tri persistant, l’appartenance multiple, la mémoire par projet et des panneaux d’organisation ancrés.",
    "Ajoute l’organisation sûre des projets et des sessions par glisser-déposer, avec confirmation pour les sessions non vides et protection des sessions en cours.",
    "Supprime les infobulles persistantes des chemins de projet qui masquaient la barre latérale.",
    "Conserve les identifiants et les transcriptions des sessions lors du changement de projet.",
  ],
}, {
  version: "0.0.2",
  date: "2026-09-18",
  highlights: ["Affiche un message clair en cas d’échec de mise à jour tout en conservant les détails de diagnostic dans les journaux locaux."],
}, {
  version: "0.0.1",
  date: "2026-09-17",
  highlights: ["Établit PI Desktop Nexus comme un espace de travail indépendant de programmation IA local, avec espaces gérés, paquets de flux, Context Vault et thèmes panoramiques."],
}];
