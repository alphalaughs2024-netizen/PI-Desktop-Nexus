export type SpecialistCategory = "Design" | "Coding" | "Data" | "Business" | "Infrastructure";

export type SpecialistSkill = {
  id: string;
  name: string;
  description: string;
  category: SpecialistCategory;
  source: string;
  document: string;
};

const documents = import.meta.glob("./*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const entries: Array<Omit<SpecialistSkill, "document" | "source">> = [
  { id: "web-component-design", name: "Web Component Design", description: "Design reusable components with accessible behavior and stable APIs.", category: "Design" },
  { id: "mobile-ios-design", name: "Mobile iOS Design", description: "Apply iOS navigation, layout, and interaction conventions.", category: "Design" },
  { id: "screen-reader-testing", name: "Screen Reader Testing", description: "Test real assistive-technology journeys and fix accessibility barriers.", category: "Design" },
  { id: "python-project-structure", name: "Python Project Structure", description: "Organize Python packages, tests, and tooling for maintainability.", category: "Coding" },
  { id: "temporal-python-testing", name: "Temporal Python Testing", description: "Test Temporal workflows and activities with focused fixtures.", category: "Coding" },
  { id: "turborepo-caching", name: "Turborepo Caching", description: "Configure effective task graphs and local or remote caching.", category: "Coding" },
  { id: "protocol-reverse-engineering", name: "Protocol Reverse Engineering", description: "Analyze undocumented protocols from observable behavior.", category: "Coding" },
  { id: "recsys-pipeline-architect", name: "Recommendation Pipelines", description: "Design recommendation data and serving pipelines.", category: "Data" },
  { id: "startup-metrics-framework", name: "Startup Metrics", description: "Choose and interpret product and growth metrics.", category: "Business" },
  { id: "competitive-landscape", name: "Competitive Landscape", description: "Research competitors and map defensible differentiation.", category: "Business" },
  { id: "gitlab-ci-patterns", name: "GitLab CI Patterns", description: "Build reliable GitLab CI pipelines and deployment stages.", category: "Infrastructure" },
  { id: "linkerd-patterns", name: "Linkerd Patterns", description: "Plan service-mesh traffic, security, and operations with Linkerd.", category: "Infrastructure" },
  { id: "istio-traffic-management", name: "Istio Traffic Management", description: "Configure Istio routing, resilience, and rollout behavior.", category: "Infrastructure" },
];

export const SPECIALIST_SKILLS: SpecialistSkill[] = entries.map((entry) => {
  const document = documents[`./${entry.id}.md`];
  if (!document) throw new Error(`Missing bundled specialist skill: ${entry.id}`);
  return { ...entry, source: "Seth Hobson / agents", document };
});

export function specialistSkillBody(document: string): string {
  return document.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
}
