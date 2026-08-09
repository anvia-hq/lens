export type DocsLink = {
  href: string;
  label: string;
};

export type DocsGroup = {
  label: string;
  links: DocsLink[];
};

export const docsNavigation: DocsGroup[] = [
  {
    label: "Introduction",
    links: [
      { href: "/docs/", label: "Documentation" },
      { href: "/docs/getting-started/", label: "Getting started" },
      { href: "/docs/concepts/", label: "Core concepts" },
    ],
  },
  {
    label: "Connect",
    links: [
      { href: "/docs/connect/anvia/", label: "Anvia Lens SDK" },
      { href: "/docs/connect/langfuse/", label: "Langfuse" },
    ],
  },
  {
    label: "Observability",
    links: [
      { href: "/docs/observability/", label: "Overview" },
      { href: "/docs/observability/traces/", label: "Traces" },
      { href: "/docs/observability/trace-detail/", label: "Trace details" },
      { href: "/docs/observability/sessions/", label: "Sessions" },
      { href: "/docs/observability/users/", label: "Users" },
      { href: "/docs/observability/costs/", label: "Cost settings" },
    ],
  },
  {
    label: "Evaluations",
    links: [
      { href: "/docs/evaluations/what-to-evaluate/", label: "What to evaluate" },
      { href: "/docs/evaluations/", label: "Evaluation workflow" },
      { href: "/docs/evaluations/runs/", label: "Runs" },
      { href: "/docs/evaluations/results/", label: "Results" },
      { href: "/docs/evaluations/compare/", label: "Compare" },
      { href: "/docs/evaluations/gates/", label: "Quality gates" },
      { href: "/docs/evaluations/datasets/", label: "Datasets" },
    ],
  },
  {
    label: "Management",
    links: [
      { href: "/docs/management/authentication/", label: "Authentication" },
      { href: "/docs/management/projects/", label: "Projects" },
      { href: "/docs/management/members/", label: "Members and roles" },
      { href: "/docs/management/project-settings/", label: "Project settings" },
    ],
  },
  {
    label: "Operations",
    links: [
      { href: "/docs/operations/deployment/", label: "Deployment" },
      { href: "/docs/operations/configuration/", label: "Configuration" },
      { href: "/docs/operations/upgrades/", label: "Upgrades and backups" },
      { href: "/docs/operations/troubleshooting/", label: "Troubleshooting" },
    ],
  },
];

export const docsLinks = docsNavigation.flatMap((group) => group.links);

export function docsNeighbors(pathname: string) {
  const index = docsLinks.findIndex((link) => link.href === pathname);
  if (index === -1) return {};
  return {
    previous: docsLinks[index - 1],
    next: docsLinks[index + 1],
  };
}
