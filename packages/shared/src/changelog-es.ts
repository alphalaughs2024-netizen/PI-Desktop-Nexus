import type { ChangelogEntry } from "./changelog.js";

export const esEntries: ChangelogEntry[] = [{
  version: "0.0.4",
  date: "2026-09-18",
  highlights: [
    "Añade un modo de acceso total con confirmación explícita para sesiones de agente de confianza y conserva las restricciones de seguridad del host.",
    "Añade la migración del esquema de base de datos v16 a v17 con copia de seguridad, preservando sesiones, transcripciones e índices.",
    "Corrige la compatibilidad de inicio con datos creados por la compilación experimental de acceso total.",
  ],
}, {
  version: "0.0.3",
  date: "2026-09-18",
  highlights: [
    "Reduce la sangría de la barra lateral y conserva la jerarquía, el foco, los temas y los indicadores de colocación.",
    "Añade grupos de proyectos, orden persistente, pertenencia a varios proyectos, memoria por proyecto y paneles de organización anclados.",
    "Añade organización segura de proyectos y sesiones mediante arrastrar y soltar, con confirmación para sesiones no vacías y protección de sesiones en ejecución.",
    "Elimina los tooltips persistentes de rutas de proyecto que obstruían la barra lateral.",
    "Conserva los identificadores y las transcripciones de las sesiones al cambiar su proyecto.",
  ],
}, {
  version: "0.0.2",
  date: "2026-09-18",
  highlights: ["Muestra mensajes claros cuando falla la actualización y conserva los detalles de diagnóstico en los registros locales."],
}, {
  version: "0.0.1",
  date: "2026-09-17",
  highlights: ["Establece PI Desktop Nexus como un espacio de trabajo independiente y local para programación con IA, con espacios administrados, paquetes de flujo de trabajo, Context Vault y temas escénicos."],
}];
