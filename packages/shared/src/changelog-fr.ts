import type { ChangelogEntry } from "./changelog.js";

export const frEntries: ChangelogEntry[] = [{
  version: "0.0.7",
  date: "2026-09-30",
  highlights: [
    "Ajoute la dictée locale, les conversations vocales côte à côte, les réponses vocales en texte seul et la transcription hors ligne avec Parakeet.",
    "Ajoute des tâches planifiées gérées par l'hôte, avec des réglages vérifiables et un espace de travail plus clair.",
    "Ajoute un marché local de compétences spécialisées et des vues de plugins fiables, avec des réglages distincts pour les workflows et les compétences.",
    "Améliore l'historique des prompts, les commandes slash et le choix des compétences ; le compositeur reste stable quand les panneaux bougent.",
    "Aligne le verre des compositeurs scenic sur les thèmes officiels et améliore les suggestions de modèles et l'analyse d'utilisation.",
  ],
}, {
  version: "0.0.6",
  date: "2026-09-28",
  highlights: [
    "Améliore les onglets du navigateur avec un état de page séparé, la fermeture fiable du dernier onglet, la navigation parallèle et les contrôles de navigateur de l'agent.",
    "Affîne le panneau de travail redimensionnable et la barre latérale repliable afin de préserver l'espace de chat dans les mises en page étroites et larges.",
    "Ajoute des contrôles de messages en attente déplaçables, des actions guider/supprimer par icônes, des actions de file et un mode de guidage par chat.",
  ],
}, {
  version: "0.0.5",
  date: "2026-09-23",
  highlights: [
    "Améliore Workspaces avec un état vide utile, une action d’ouverture de projet, des métadonnées localisées, des badges d’état et des actions de ligne protégées.",
    "Corrige les surfaces des réglages dans les quatre thèmes scenic intégrés afin de garder les lignes de l’archive des projets lisibles sans cadre extérieur.",
  ],
}, {
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
