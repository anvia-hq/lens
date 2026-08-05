import type {
  CreatedProjectApiKey,
  Metrics,
  MetricsRangePreset,
  Page as PaginatedPage,
  Project,
  ProjectApiKey,
  SessionDetail,
  SessionSummary,
  SpanDetail,
  SpanStatus,
  TraceDetail,
  TraceFacets,
  TraceSortField,
  TraceSummary,
} from "@lens/contracts";
import { metricsRangePresets, traceSortFields } from "@lens/contracts";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@lens/ui/components/accordion";
import { Alert, AlertDescription, AlertTitle } from "@lens/ui/components/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@lens/ui/components/alert-dialog";
import { Avatar, AvatarFallback } from "@lens/ui/components/avatar";
import { Badge } from "@lens/ui/components/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@lens/ui/components/breadcrumb";
import { Button, buttonVariants } from "@lens/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@lens/ui/components/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@lens/ui/components/chart";
import { Checkbox } from "@lens/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@lens/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@lens/ui/components/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@lens/ui/components/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@lens/ui/components/field";
import { Input } from "@lens/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@lens/ui/components/native-select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@lens/ui/components/pagination";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@lens/ui/components/resizable";
import { ScrollArea } from "@lens/ui/components/scroll-area";
import { Sheet, SheetContent, SheetTitle } from "@lens/ui/components/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@lens/ui/components/sidebar";
import { Skeleton } from "@lens/ui/components/skeleton";
import { Spinner } from "@lens/ui/components/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lens/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@lens/ui/components/tabs";
import { Textarea } from "@lens/ui/components/textarea";
import { toast } from "@lens/ui/components/toast";
import { cn } from "@lens/ui/lib/utils";
import {
  Pulse as Activity,
  DangerCircle as AlertCircle,
  ArrowLeft,
  SortVertical as ArrowUpDown,
  Code2 as Braces,
  CheckCircle as Check,
  AltArrowDown as ChevronDown,
  AltArrowRight as ChevronRight,
  RecordCircle as CircleDot,
  ClockCircle as Clock3,
  Copy,
  Database,
  Graph as Gauge,
  Key as KeyRound,
  Laptop,
  Layers as Layers3,
  Logout2 as LogOut,
  UserPlus as MailPlus,
  Dialog2 as MessagesSquare,
  Moon,
  AddCircle as Plus,
  Refresh,
  Magnifer as Search,
  Settings,
  Filter as SlidersHorizontal,
  Stars as Sparkles,
  Sun,
  Programming as TerminalSquare,
  TrashBin2 as Trash2,
  UsersGroupRounded as Users,
  CloseCircle as X,
  Bolt as Zap,
} from "@solar-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  useNavigate,
  useParams,
  useRouterState,
  useSearch,
} from "@tanstack/react-router";
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import {
  createContext,
  type FormEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "./components/theme-provider";
import { TraceDetailExplorer, type TraceSpanView } from "./components/trace-detail-explorer";
import { api, queryString } from "./lib/api";
import { authClient } from "./lib/auth";

type ProjectWithRole = Project & { role: string };
type TeamMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  createdAt: string;
  isCurrentUser: boolean;
};
type TeamInvitation = {
  id: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
};
type TeamDirectory = {
  organizationId: string;
  role: string;
  canManage: boolean;
  members: TeamMember[];
  invitations: TeamInvitation[];
};
type ProjectContextValue = {
  project: ProjectWithRole;
  projects: ProjectWithRole[];
  selectProject: (id: string) => void;
};

export type OverviewSearch = { range: MetricsRangePreset };
export type TraceDetailSearch = {
  view?: TraceSpanView;
  span?: string;
};
export const traceColumnIds = [
  "startedAt",
  "trace",
  "status",
  "durationMs",
  "totalCost",
  "model",
  "totalTokens",
  "environment",
  "userId",
  "sessionId",
  "serviceName",
  "release",
  "version",
  "serviceVersion",
  "inputCost",
  "outputCost",
  "inputTokens",
  "outputTokens",
  "spanCount",
  "generationCount",
  "toolCount",
  "tags",
  "endedAt",
  "traceId",
] as const;
export type TraceColumnId = (typeof traceColumnIds)[number];
export const defaultTraceColumns: TraceColumnId[] = [
  "startedAt",
  "trace",
  "status",
  "durationMs",
  "totalCost",
  "model",
  "totalTokens",
  "environment",
  "userId",
  "sessionId",
];
export type TracesSearch = {
  range: MetricsRangePreset;
  statuses?: SpanStatus[];
  services?: string[];
  names?: string[];
  models?: string[];
  environments?: string[];
  releases?: string[];
  versions?: string[];
  serviceVersions?: string[];
  tags?: string[];
  userId?: string;
  sessionId?: string;
  traceId?: string;
  search?: string;
  minDurationMs?: number;
  maxDurationMs?: number;
  minTotalTokens?: number;
  maxTotalTokens?: number;
  minTotalCost?: number;
  maxTotalCost?: number;
  sort?: TraceSortField;
  order?: "asc" | "desc";
  page?: number;
  pageSize?: 25 | 50 | 100;
  columns?: TraceColumnId[];
};

type ResolvedTracesSearch = TracesSearch & {
  sort: TraceSortField;
  order: "asc" | "desc";
  page: number;
  pageSize: 25 | 50 | 100;
  columns: TraceColumnId[];
};

export function validateOverviewSearch(search: Record<string, unknown>): OverviewSearch {
  return { range: parseMetricsRange(search.range) };
}

export function validateTraceDetailSearch(search: Record<string, unknown>): TraceDetailSearch {
  return {
    view: search.view === "timeline" ? "timeline" : undefined,
    span: optionalSearchValue(search.span),
  };
}

export function validateTracesSearch(search: Record<string, unknown>): TracesSearch {
  return {
    range: parseMetricsRange(search.range),
    statuses: searchValues(search.statuses ?? search.status).filter(
      (value): value is SpanStatus => value === "ok" || value === "error" || value === "unset",
    ),
    services: searchValues(search.services ?? search.service),
    names: searchValues(search.names),
    models: searchValues(search.models ?? search.model),
    environments: searchValues(search.environments),
    releases: searchValues(search.releases),
    versions: searchValues(search.versions),
    serviceVersions: searchValues(search.serviceVersions),
    tags: searchValues(search.tags),
    userId: optionalSearchValue(search.userId),
    sessionId: optionalSearchValue(search.sessionId),
    traceId: optionalSearchValue(search.traceId),
    search: optionalSearchValue(search.search),
    minDurationMs: optionalNonNegativeNumber(search.minDurationMs),
    maxDurationMs: optionalNonNegativeNumber(search.maxDurationMs),
    minTotalTokens: optionalNonNegativeNumber(search.minTotalTokens),
    maxTotalTokens: optionalNonNegativeNumber(search.maxTotalTokens),
    minTotalCost: optionalNonNegativeNumber(search.minTotalCost),
    maxTotalCost: optionalNonNegativeNumber(search.maxTotalCost),
    sort: isTraceSortField(search.sort) ? search.sort : "startedAt",
    order: search.order === "asc" ? "asc" : "desc",
    page: positiveInteger(search.page, 1),
    pageSize: search.pageSize === 25 || search.pageSize === 100 ? search.pageSize : 50,
    columns: validTraceColumns(search.columns),
  };
}

const ProjectContext = createContext<ProjectContextValue | null>(null);
const throughputChartConfig = {
  traces: { label: "Traces", color: "var(--chart-2)" },
  generations: { label: "Generations", color: "var(--chart-1)" },
  traceErrors: { label: "Errors", color: "var(--destructive)" },
} satisfies ChartConfig;
const tokenChartConfig = {
  inputTokens: { label: "Input tokens", color: "var(--chart-2)" },
  outputTokens: { label: "Output tokens", color: "var(--chart-1)" },
} satisfies ChartConfig;
const latencyChartConfig = {
  generationDurationP50Ms: { label: "P50", color: "var(--chart-2)" },
  generationDurationP95Ms: { label: "P95", color: "var(--chart-1)" },
} satisfies ChartConfig;
const modelChartConfig = {
  totalTokens: { label: "Total tokens", color: "var(--chart-2)" },
} satisfies ChartConfig;
const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});
const traceColumnHelper = createColumnHelper<typeof dataTableFeatures, TraceSummary>();
const sessionColumnHelper = createColumnHelper<typeof dataTableFeatures, SessionSummary>();

type SortableHeaderColumn = {
  getIsSorted: () => false | "asc" | "desc";
  getToggleSortingHandler: () => ((event: unknown) => void) | undefined;
};

function sortableHeader(label: string) {
  return ({ column }: { column: SortableHeaderColumn }) => {
    const direction = column.getIsSorted();
    return (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3"
        onClick={column.getToggleSortingHandler()}
        aria-label={`Sort by ${label}${direction ? `, currently ${direction}` : ""}`}
      >
        {label}
        <ArrowUpDown />
      </Button>
    );
  };
}

function traceTableColumns(options: {
  visible: TraceColumnId[];
  sort?: TraceSortField;
  order?: "asc" | "desc";
  onSort?: (sort: TraceSortField) => void;
}) {
  const header = (label: string, sort: TraceSortField) => () =>
    options.onSort ? (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3"
        onClick={() => options.onSort?.(sort)}
        aria-label={`Sort by ${label}${options.sort === sort ? `, currently ${options.order}` : ""}`}
      >
        {label}
        <ArrowUpDown className={cn(options.sort === sort && "text-primary")} />
      </Button>
    ) : (
      label
    );
  const columnsById = {
    startedAt: traceColumnHelper.accessor("startedAt", {
      header: header("Started", "startedAt"),
      cell: ({ row }) => (
        <span className="grid text-xs" title={row.original.startedAt}>
          <span>{relativeTime(row.original.startedAt)}</span>
          <span className="text-muted-foreground">{formatTimestamp(row.original.startedAt)}</span>
        </span>
      ),
    }),
    trace: traceColumnHelper.accessor("name", {
      id: "trace",
      header: header("Trace", "name"),
      cell: ({ row }) => <TraceNameCell trace={row.original} />,
    }),
    status: traceColumnHelper.accessor("status", {
      header: header("Status", "status"),
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    }),
    durationMs: traceColumnHelper.accessor("durationMs", {
      header: header("Latency", "durationMs"),
      cell: ({ row }) => (
        <span className="font-mono">{formatDuration(row.original.durationMs)}</span>
      ),
    }),
    totalCost: traceColumnHelper.accessor("totalCost", {
      header: header("Cost", "totalCost"),
      cell: ({ row }) => <span className="font-mono">{formatCost(row.original.totalCost)}</span>,
    }),
    model: traceColumnHelper.accessor("model", {
      header: header("Model", "model"),
      cell: ({ row }) => row.original.model ?? "—",
    }),
    totalTokens: traceColumnHelper.accessor("totalTokens", {
      header: header("Tokens", "totalTokens"),
      cell: ({ row }) => (
        <span className="grid font-mono text-xs">
          <span>{formatNumber(row.original.totalTokens)}</span>
          <span className="text-muted-foreground">
            {formatNumber(row.original.inputTokens)} in · {formatNumber(row.original.outputTokens)}{" "}
            out
          </span>
        </span>
      ),
    }),
    environment: traceColumnHelper.accessor("environment", {
      header: header("Environment", "environment"),
      cell: ({ row }) => <Badge variant="secondary">{row.original.environment}</Badge>,
    }),
    userId: traceColumnHelper.accessor("userId", {
      header: header("User", "userId"),
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.userId ?? "—"}</span>,
    }),
    sessionId: traceColumnHelper.accessor("sessionId", {
      header: header("Session", "sessionId"),
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.sessionId ?? "—"}</span>,
    }),
    serviceName: traceColumnHelper.accessor("serviceName", {
      header: header("Service", "serviceName"),
    }),
    release: traceColumnHelper.accessor("release", {
      header: header("Release", "release"),
      cell: ({ row }) => row.original.release ?? "—",
    }),
    version: traceColumnHelper.accessor("version", {
      header: header("Trace version", "version"),
      cell: ({ row }) => row.original.version ?? "—",
    }),
    serviceVersion: traceColumnHelper.accessor("serviceVersion", {
      header: header("Service version", "serviceVersion"),
      cell: ({ row }) => row.original.serviceVersion ?? "—",
    }),
    inputCost: traceColumnHelper.accessor("inputCost", {
      header: header("Input cost", "inputCost"),
      cell: ({ row }) => <span className="font-mono">{formatCost(row.original.inputCost)}</span>,
    }),
    outputCost: traceColumnHelper.accessor("outputCost", {
      header: header("Output cost", "outputCost"),
      cell: ({ row }) => <span className="font-mono">{formatCost(row.original.outputCost)}</span>,
    }),
    inputTokens: traceColumnHelper.accessor("inputTokens", {
      header: header("Input tokens", "inputTokens"),
      cell: ({ row }) => (
        <span className="font-mono">{formatNumber(row.original.inputTokens)}</span>
      ),
    }),
    outputTokens: traceColumnHelper.accessor("outputTokens", {
      header: header("Output tokens", "outputTokens"),
      cell: ({ row }) => (
        <span className="font-mono">{formatNumber(row.original.outputTokens)}</span>
      ),
    }),
    spanCount: traceColumnHelper.accessor("spanCount", {
      header: header("Spans", "spanCount"),
    }),
    generationCount: traceColumnHelper.accessor("generationCount", {
      header: header("Generations", "generationCount"),
    }),
    toolCount: traceColumnHelper.accessor("toolCount", {
      header: header("Tools", "toolCount"),
    }),
    tags: traceColumnHelper.accessor("tags", {
      header: () => "Tags",
      cell: ({ row }) => (
        <div className="flex max-w-72 flex-wrap gap-1 whitespace-normal">
          {row.original.tags.length === 0
            ? "—"
            : row.original.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
        </div>
      ),
    }),
    endedAt: traceColumnHelper.accessor("endedAt", {
      header: header("Ended", "endedAt"),
      cell: ({ row }) => relativeTime(row.original.endedAt),
    }),
    traceId: traceColumnHelper.accessor("traceId", {
      header: header("Trace ID", "traceId"),
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.traceId}</span>,
    }),
  };
  return traceColumnHelper.columns([
    ...options.visible.map((column) => columnsById[column]),
    traceColumnHelper.display({
      id: "open",
      header: () => <span className="sr-only">Open</span>,
      cell: ({ row }) => <TraceOpenCell trace={row.original} />,
    }),
  ] as Parameters<typeof traceColumnHelper.columns>[0]);
}

const sessionColumns = sessionColumnHelper.columns([
  sessionColumnHelper.accessor("sessionId", {
    header: sortableHeader("Session"),
    cell: ({ row }) => <SessionNameCell session={row.original} />,
  }),
  sessionColumnHelper.accessor("userId", {
    header: sortableHeader("User"),
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.userId ?? "—"}</span>,
  }),
  sessionColumnHelper.accessor("traceCount", {
    header: sortableHeader("Traces"),
    cell: ({ row }) => <span className="font-mono">{formatNumber(row.original.traceCount)}</span>,
  }),
  sessionColumnHelper.accessor("errorCount", {
    header: sortableHeader("Errors"),
    cell: ({ row }) =>
      row.original.errorCount > 0 ? (
        <Badge variant="destructive">{row.original.errorCount}</Badge>
      ) : (
        <Badge variant="secondary">0</Badge>
      ),
  }),
  sessionColumnHelper.accessor("durationMs", {
    header: sortableHeader("Duration"),
    cell: ({ row }) => <span className="font-mono">{formatDuration(row.original.durationMs)}</span>,
  }),
  sessionColumnHelper.accessor("totalTokens", {
    header: sortableHeader("Tokens"),
    cell: ({ row }) => <span className="font-mono">{formatNumber(row.original.totalTokens)}</span>,
  }),
  sessionColumnHelper.accessor("startedAt", {
    header: sortableHeader("Started"),
    cell: ({ row }) => relativeTime(row.original.startedAt),
  }),
  sessionColumnHelper.display({
    id: "open",
    header: () => <span className="sr-only">Open</span>,
    cell: ({ row }) => <SessionOpenCell session={row.original} />,
  }),
]);

function useProject(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (context === null) throw new Error("Project context is unavailable");
  return context;
}

function notify(title: string, type: "success" | "error" | "info" = "success") {
  toast.add({ title, type, priority: type === "error" ? "high" : "low" });
}

export function AppRoot() {
  const session = authClient.useSession();
  if (session.isPending) return <FullPageMessage icon={<Activity />} text="Opening Anvia Lens" />;
  if (session.data === null) return <AuthPage />;
  if (window.location.pathname.startsWith("/accept-invitation/")) return <Outlet />;
  return <AuthenticatedApp user={session.data.user} />;
}

function AuthenticatedApp(props: { user: { name: string; email: string } }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const params = useParams({ strict: false });
  const routeProjectId = "projectId" in params ? params.projectId : undefined;
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<{ items: ProjectWithRole[] }>("/api/v1/projects"),
  });
  const projects = projectsQuery.data?.items ?? [];
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem("lens-project") ?? "");
  const project =
    projects.find((item) => item.id === routeProjectId) ??
    (routeProjectId === undefined
      ? (projects.find((item) => item.id === selectedId) ?? projects[0])
      : undefined);

  if (projectsQuery.isLoading)
    return <FullPageMessage icon={<Activity />} text="Loading projects" />;
  if (projectsQuery.isError)
    return (
      <FullPageMessage icon={<AlertCircle />} text="Could not load your Anvia Lens projects" />
    );
  if (project === undefined) {
    return projects.length === 0 ? (
      <SetupPage />
    ) : (
      <FullPageMessage icon={<AlertCircle />} text="Project not found or access was removed" />
    );
  }

  const selectProject = (id: string) => {
    localStorage.setItem("lens-project", id);
    setSelectedId(id);
    void navigate({ to: "/$projectId", params: { projectId: id }, search: { range: "24h" } });
  };

  return (
    <ProjectContext.Provider value={{ project, projects, selectProject }}>
      {pathname === "/" ? (
        <ProjectSelectorShell user={props.user} />
      ) : (
        <SidebarProvider>
          <AppSidebar user={props.user} />
          <SidebarInset>
            <AppHeader />
            <Outlet />
          </SidebarInset>
        </SidebarProvider>
      )}
    </ProjectContext.Provider>
  );
}

function ProjectSelectorShell(props: { user: { name: string; email: string } }) {
  return (
    <div className="flex min-h-svh w-full flex-col bg-background">
      <header className="flex h-14 items-center border-b px-4 md:px-6">
        <Link className="flex items-center gap-2" to="/">
          <span className="font-heading text-lg font-semibold">Anvia Lens</span>
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">{props.user.email}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Sign out"
            onClick={() => authClient.signOut()}
          >
            <LogOut />
          </Button>
        </div>
      </header>
      <Outlet />
    </div>
  );
}

function AppSidebar(props: { user: { name: string; email: string } }) {
  const { project } = useProject();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const projectRoot = `/${project.id}`;
  const observabilityLinks = [
    { to: "/$projectId" as const, path: projectRoot, label: "Overview", icon: Gauge },
    {
      to: "/$projectId/traces" as const,
      path: `${projectRoot}/traces`,
      label: "Traces",
      icon: Activity,
    },
    {
      to: "/$projectId/sessions" as const,
      path: `${projectRoot}/sessions`,
      label: "Sessions",
      icon: MessagesSquare,
    },
  ];
  const managementLinks = [
    {
      to: "/$projectId/onboarding" as const,
      path: `${projectRoot}/onboarding`,
      label: "Connect",
      icon: TerminalSquare,
    },
    {
      to: "/$projectId/settings" as const,
      path: `${projectRoot}/settings`,
      label: "Project settings",
      icon: Settings,
    },
  ];
  const renderLinks = (links: typeof observabilityLinks | typeof managementLinks) => (
    <SidebarMenu className="gap-1">
      {links.map(({ to, path, label, icon: Icon }) => {
        const active = path === projectRoot ? pathname === path : pathname.startsWith(path);
        return (
          <SidebarMenuItem key={to}>
            <SidebarMenuButton
              render={<Link to={to} params={{ projectId: project.id }} />}
              isActive={active}
              tooltip={label}
            >
              <Icon />
              <span>{label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
  return (
    <Sidebar className="border-r border-sidebar-border" collapsible="none">
      <SidebarHeader>
        <Link className="flex h-10 items-center gap-2 px-2" to="/">
          <div className="grid min-w-0 group-data-collapsible-icon:hidden">
            <span className="font-heading text-lg font-semibold">Anvia Lens</span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Observability</SidebarGroupLabel>
          <SidebarGroupContent>{renderLinks(observabilityLinks)}</SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Management</SidebarGroupLabel>
          <SidebarGroupContent>{renderLinks(managementLinks)}</SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <ModeToggle />
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="flex items-center gap-2 p-2">
          <Avatar className="size-8">
            <AvatarFallback>{props.user.name.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 flex-1 group-data-collapsible-icon:hidden">
            <span className="truncate text-sm font-medium">{props.user.name}</span>
            <span className="truncate text-xs text-muted-foreground">{props.user.email}</span>
          </div>
          <Button
            className="group-data-collapsible-icon:hidden"
            variant="ghost"
            size="icon-sm"
            aria-label="Sign out"
            onClick={() => authClient.signOut()}
          >
            <LogOut />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function AppHeader() {
  const { project } = useProject();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const params = useParams({ strict: false });
  const projectRoot = `/${project.id}`;
  const relativePath = pathname.slice(projectRoot.length).split("/").filter(Boolean);
  const section = relativePath[0];
  const sectionLabel =
    section === "traces"
      ? "Traces"
      : section === "sessions"
        ? "Sessions"
        : section === "onboarding"
          ? "Connect"
          : section === "settings"
            ? "Project settings"
            : "Overview";
  const detailId = relativePath[1];
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center border-b bg-background px-4">
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbLink
              className="truncate font-medium"
              render={
                <Link
                  to="/$projectId"
                  params={{ projectId: project.id }}
                  search={{ range: "24h" }}
                />
              }
            >
              {project.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          {detailId ? (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink
                  render={
                    section === "traces" ? (
                      <Link
                        to="/$projectId/traces"
                        params={{ projectId: project.id }}
                        search={{ range: "24h" }}
                      />
                    ) : (
                      <Link to="/$projectId/sessions" params={{ projectId: project.id }} />
                    )
                  }
                >
                  {sectionLabel}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage className="truncate font-mono text-xs">
                  {"traceId" in params
                    ? shortId(String(params.traceId))
                    : "sessionId" in params
                      ? String(params.sessionId)
                      : detailId}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : (
            <BreadcrumbItem>
              <BreadcrumbPage>{sectionLabel}</BreadcrumbPage>
            </BreadcrumbItem>
          )}
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  );
}

function ModeToggle() {
  const { theme, setTheme } = useTheme();
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Laptop;
  const nextTheme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
  const label =
    theme === "system" ? "System theme" : `${theme[0]?.toUpperCase()}${theme.slice(1)} theme`;
  return (
    <SidebarMenuButton
      type="button"
      title={`${label}. Switch to ${nextTheme} theme`}
      aria-label={`${label}. Switch to ${nextTheme} theme`}
      onClick={() => setTheme(nextTheme)}
    >
      <Icon />
      <span>{label}</span>
    </SidebarMenuButton>
  );
}

export function OverviewPage() {
  const { project } = useProject();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as OverviewSearch;
  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>(() =>
    adaptiveRefreshInterval(search.range),
  );
  useEffect(() => setRefreshInterval(adaptiveRefreshInterval(search.range)), [search.range]);
  const metrics = useQuery({
    queryKey: ["metrics", project.id, search.range],
    queryFn: () => api<Metrics>(`/api/v1/projects/${project.id}/metrics?range=${search.range}`),
    refetchInterval: refreshMilliseconds(refreshInterval),
  });
  const value = metrics.data;
  const setRange = (range: MetricsRangePreset) => {
    void navigate({
      to: "/$projectId",
      params: { projectId: project.id },
      search: { range },
      replace: true,
    });
  };
  return (
    <Page
      title="Overview"
      description={
        value
          ? `${formatNumber(value.current.spans)} spans · ${formatNumber(value.current.activeUsers)} active users in this window`
          : "LLM usage, model efficiency, and operational health"
      }
      action={
        <div className="flex flex-wrap items-center gap-2">
          <RangeSelector value={search.range} onChange={setRange} />
          <LiveBadge interval={refreshInterval} onIntervalChange={setRefreshInterval} />
        </div>
      }
    >
      {metrics.isLoading ? (
        <OverviewSkeleton />
      ) : metrics.isError ? (
        <ErrorAlert error={metrics.error} />
      ) : !value || value.current.traces === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<Sparkles />}
              title="Waiting for your first trace"
              text="Connect a Langfuse or OpenTelemetry exporter and activity will appear here."
              action={
                <Link
                  className={buttonVariants()}
                  to="/$projectId/onboarding"
                  params={{ projectId: project.id }}
                >
                  Connect an app
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ComparisonMetricCard
              label="Total tokens"
              value={formatNumber(value.current.totalTokens)}
              current={value.current.totalTokens}
              previous={value.previous.totalTokens}
              icon={<Zap />}
            />
            <ComparisonMetricCard
              label="Generations"
              value={formatNumber(value.current.generations)}
              current={value.current.generations}
              previous={value.previous.generations}
              icon={<Sparkles />}
            />
            <ComparisonMetricCard
              label="Tokens / generation"
              value={formatDecimal(value.current.tokensPerGeneration)}
              current={value.current.tokensPerGeneration}
              previous={value.previous.tokensPerGeneration}
              icon={<Layers3 />}
            />
            <ComparisonMetricCard
              label="Active models"
              value={formatNumber(value.current.activeModels)}
              current={value.current.activeModels}
              previous={value.previous.activeModels}
              icon={<Database />}
            />
            <ComparisonMetricCard
              label="Traces"
              value={formatNumber(value.current.traces)}
              current={value.current.traces}
              previous={value.previous.traces}
              icon={<Activity />}
            />
            <ComparisonMetricCard
              label="Error rate"
              value={formatPercent(value.current.errorRate)}
              current={value.current.errorRate}
              previous={value.previous.errorRate}
              deltaMode="points"
              lowerIsBetter
              icon={<AlertCircle />}
            />
            <ComparisonMetricCard
              label="P95 generation latency"
              value={formatDuration(value.current.generationDurationP95Ms)}
              current={value.current.generationDurationP95Ms}
              previous={value.previous.generationDurationP95Ms}
              lowerIsBetter
              icon={<Clock3 />}
            />
            <ComparisonMetricCard
              label="Active sessions"
              value={formatNumber(value.current.activeSessions)}
              current={value.current.activeSessions}
              previous={value.previous.activeSessions}
              icon={<MessagesSquare />}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <OverviewChartCard title="Token usage" description="Input and output tokens over time">
              <ChartContainer className="h-72 w-full" config={tokenChartConfig}>
                <AreaChart data={value.series} margin={{ left: 0, right: 12 }}>
                  <CartesianGrid vertical={false} />
                  {metricsXAxis(search.range)}
                  <YAxis tickFormatter={formatCompactAxis} tickLine={false} axisLine={false} />
                  {metricsTooltip(search.range)}
                  <Area
                    dataKey="inputTokens"
                    type="monotone"
                    stackId="tokens"
                    stroke="var(--color-inputTokens)"
                    fill="var(--color-inputTokens)"
                    fillOpacity={0.3}
                    strokeWidth={2}
                  />
                  <Area
                    dataKey="outputTokens"
                    type="monotone"
                    stackId="tokens"
                    stroke="var(--color-outputTokens)"
                    fill="var(--color-outputTokens)"
                    fillOpacity={0.45}
                    strokeWidth={2}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                </AreaChart>
              </ChartContainer>
            </OverviewChartCard>

            <OverviewChartCard
              title="Throughput and errors"
              description="Traces and LLM generations, with failed traces highlighted"
            >
              <ChartContainer className="h-72 w-full" config={throughputChartConfig}>
                <LineChart data={value.series} margin={{ left: 0, right: 12 }}>
                  <CartesianGrid vertical={false} />
                  {metricsXAxis(search.range)}
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  {metricsTooltip(search.range)}
                  <Line
                    dataKey="generations"
                    type="monotone"
                    stroke="var(--color-generations)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    dataKey="traces"
                    type="monotone"
                    stroke="var(--color-traces)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    dataKey="traceErrors"
                    type="monotone"
                    stroke="var(--color-traceErrors)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                </LineChart>
              </ChartContainer>
            </OverviewChartCard>

            <OverviewChartCard
              title="Generation latency"
              description="P50 and P95 latency for generation observations"
            >
              <ChartContainer className="h-72 w-full" config={latencyChartConfig}>
                <LineChart data={value.series} margin={{ left: 0, right: 12 }}>
                  <CartesianGrid vertical={false} />
                  {metricsXAxis(search.range)}
                  <YAxis
                    tickFormatter={(item) => formatDuration(Number(item))}
                    tickLine={false}
                    axisLine={false}
                    width={58}
                  />
                  {metricsTooltip(search.range, true)}
                  <Line
                    dataKey="generationDurationP95Ms"
                    type="monotone"
                    connectNulls={false}
                    stroke="var(--color-generationDurationP95Ms)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    dataKey="generationDurationP50Ms"
                    type="monotone"
                    connectNulls={false}
                    stroke="var(--color-generationDurationP50Ms)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                </LineChart>
              </ChartContainer>
            </OverviewChartCard>

            <OverviewChartCard
              title="Tokens by model"
              description="Share of total generation tokens"
            >
              <ChartContainer className="h-72 w-full" config={modelChartConfig}>
                <BarChart
                  data={value.models.map((model) => ({
                    ...model,
                    label: model.model ?? "Unknown model",
                  }))}
                  layout="vertical"
                  margin={{ left: 8, right: 20 }}
                >
                  <CartesianGrid horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={formatCompactAxis}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    dataKey="label"
                    type="category"
                    width={118}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={truncateChartLabel}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent formatter={(item) => formatNumber(Number(item))} />
                    }
                  />
                  <Bar dataKey="totalTokens" fill="var(--color-totalTokens)" radius={4} />
                </BarChart>
              </ChartContainer>
            </OverviewChartCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-5">
            <ModelBreakdownCard metrics={value} projectId={project.id} range={search.range} />
            <ServiceBreakdownCard metrics={value} projectId={project.id} range={search.range} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <TraceRankingCard
              title="Token-heavy traces"
              description="Highest token usage in this window"
              traces={value.topTokenTraces}
              projectId={project.id}
            />
            <TraceRankingCard
              title="Recent failures"
              description="Latest traces with an error"
              traces={value.recentErrors}
              projectId={project.id}
              emptyText="No failed traces in this window."
            />
          </div>
        </>
      )}
    </Page>
  );
}

export type RefreshInterval = "5s" | "10s" | "30s" | "Off";

export function RangeSelector(props: {
  value: MetricsRangePreset;
  onChange: (range: MetricsRangePreset) => void;
}) {
  return (
    <fieldset
      className="flex rounded-md border bg-background p-0.5"
      aria-label="Overview time range"
    >
      {metricsRangePresets.map((range) => (
        <Button
          key={range}
          type="button"
          size="sm"
          variant={props.value === range ? "secondary" : "ghost"}
          className="h-7 px-2.5"
          aria-pressed={props.value === range}
          onClick={() => props.onChange(range)}
        >
          {range}
        </Button>
      ))}
    </fieldset>
  );
}

export function ComparisonMetricCard(props: {
  label: string;
  value: string;
  current: number;
  previous: number;
  icon: ReactNode;
  deltaMode?: "relative" | "points";
  lowerIsBetter?: boolean;
}) {
  const delta = comparisonDelta(props.current, props.previous, props.deltaMode ?? "relative");
  const improved =
    props.lowerIsBetter && delta.direction !== "flat" ? delta.direction === "down" : false;
  const worsened =
    props.lowerIsBetter && delta.direction !== "flat" ? delta.direction === "up" : false;
  return (
    <Card>
      <CardHeader>
        <CardDescription>{props.label}</CardDescription>
        <CardAction>
          <span className="flex size-8 items-center justify-center rounded-lg bg-muted">
            {props.icon}
          </span>
        </CardAction>
        <CardTitle className="text-2xl tabular-nums">{props.value}</CardTitle>
        <p
          className={cn(
            "text-xs tabular-nums text-muted-foreground",
            improved && "text-emerald-600 dark:text-emerald-400",
            worsened && "text-destructive",
          )}
        >
          <span aria-hidden="true">{delta.label}</span>{" "}
          <span className="text-muted-foreground" aria-hidden="true">
            vs previous period
          </span>
          <span className="sr-only">{delta.accessibleLabel} compared with the previous period</span>
        </p>
      </CardHeader>
    </Card>
  );
}

function OverviewChartCard(props: { title: string; description: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
        <CardDescription>{props.description}</CardDescription>
      </CardHeader>
      <CardContent>{props.children}</CardContent>
    </Card>
  );
}

function ModelBreakdownCard(props: {
  metrics: Metrics;
  projectId: string;
  range: MetricsRangePreset;
}) {
  return (
    <Card className="xl:col-span-3">
      <CardHeader>
        <CardTitle>Model efficiency</CardTitle>
        <CardDescription>Usage, latency, and reliability by generation model</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Generations</TableHead>
                <TableHead className="text-right">Token share</TableHead>
                <TableHead className="text-right">Input</TableHead>
                <TableHead className="text-right">Output</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Tokens / gen</TableHead>
                <TableHead className="text-right">P95</TableHead>
                <TableHead className="text-right">Errors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.metrics.models.map((model) => (
                <TableRow key={model.model ?? "unknown"}>
                  <TableCell className="font-medium">
                    {model.model ? (
                      <Link
                        className="hover:underline"
                        to="/$projectId/traces"
                        params={{ projectId: props.projectId }}
                        search={{ range: props.range, models: [model.model] }}
                      >
                        {model.model}
                      </Link>
                    ) : (
                      "Unknown model"
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(model.generations)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatPercent(model.tokenShare)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(model.inputTokens)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(model.outputTokens)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(model.totalTokens)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatDecimal(model.tokensPerGeneration)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatDuration(model.durationP95Ms)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatPercent(model.errorRate)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ServiceBreakdownCard(props: {
  metrics: Metrics;
  projectId: string;
  range: MetricsRangePreset;
}) {
  return (
    <Card className="xl:col-span-2">
      <CardHeader>
        <CardTitle>Services</CardTitle>
        <CardDescription>Token load and trace health by service</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead className="text-right">Traces</TableHead>
                <TableHead className="text-right">Generations</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">P95</TableHead>
                <TableHead className="text-right">Errors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.metrics.services.map((service) => (
                <TableRow key={service.serviceName}>
                  <TableCell className="max-w-48 font-medium">
                    <Link
                      className="block truncate hover:underline"
                      to="/$projectId/traces"
                      params={{ projectId: props.projectId }}
                      search={{ range: props.range, services: [service.serviceName] }}
                    >
                      {service.serviceName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(service.traces)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(service.generations)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(service.totalTokens)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatDuration(service.durationP95Ms)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatPercent(service.errorRate)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function TraceRankingCard(props: {
  title: string;
  description: string;
  traces: TraceSummary[];
  projectId: string;
  emptyText?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
        <CardDescription>{props.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-1">
        {props.traces.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {props.emptyText ?? "No traces in this window."}
          </p>
        ) : (
          props.traces.map((trace) => (
            <Link
              key={trace.traceId}
              className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/60"
              to="/$projectId/traces/$traceId"
              params={{ projectId: props.projectId, traceId: trace.traceId }}
            >
              <ObservationIcon kind={trace.generationCount > 0 ? "generation" : "span"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{trace.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {trace.model ?? trace.serviceName} · {relativeTime(trace.startedAt)}
                </span>
              </span>
              <span className="text-right">
                <span className="block font-mono text-sm">{formatNumber(trace.totalTokens)}</span>
                <span className="block text-xs text-muted-foreground">tokens</span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function OverviewSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          "tokens",
          "generations",
          "efficiency",
          "models",
          "traces",
          "errors",
          "latency",
          "sessions",
        ].map((key) => (
          <Skeleton className="h-32" key={key} />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {["token-chart", "throughput-chart", "latency-chart", "model-chart"].map((key) => (
          <Skeleton className="h-96" key={key} />
        ))}
      </div>
    </div>
  );
}

function metricsXAxis(range: MetricsRangePreset) {
  return (
    <XAxis
      dataKey="timestamp"
      tickFormatter={(item) => formatMetricTimestamp(String(item), range, false)}
      minTickGap={24}
      tickLine={false}
      axisLine={false}
    />
  );
}

function metricsTooltip(range: MetricsRangePreset, duration = false) {
  return (
    <ChartTooltip
      content={
        <ChartTooltipContent
          labelFormatter={(_label, payload) =>
            formatMetricTimestamp(String(payload[0]?.payload?.timestamp ?? ""), range, true)
          }
          formatter={(item) =>
            duration ? formatDuration(Number(item)) : formatNumber(Number(item))
          }
        />
      }
    />
  );
}

export function TracesPage() {
  const { project } = useProject();
  const navigate = useNavigate();
  const filters = useSearch({ strict: false }) as ResolvedTracesSearch;
  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>("5s");
  const [filterPanelCollapsed, setFilterPanelCollapsed] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState(filters.search ?? "");
  const range = useMemo(() => timeRangeForPreset(filters.range), [filters.range]);
  const setFilters = useCallback(
    (changes: Partial<TracesSearch>, resetPage = true) => {
      void navigate({
        to: "/$projectId/traces",
        params: { projectId: project.id },
        search: { ...filters, ...changes, page: resetPage ? 1 : (changes.page ?? filters.page) },
        replace: true,
      });
    },
    [filters, navigate, project.id],
  );
  useEffect(() => setSearchDraft(filters.search ?? ""), [filters.search]);
  useEffect(() => {
    if (searchDraft === (filters.search ?? "")) return;
    const timeout = window.setTimeout(
      () => setFilters({ search: searchDraft.trim() || undefined }),
      300,
    );
    return () => window.clearTimeout(timeout);
  }, [searchDraft, filters.search, setFilters]);
  const requestFilters = {
    ...range,
    status: filters.statuses,
    service: filters.services,
    name: filters.names,
    model: filters.models,
    environment: filters.environments,
    release: filters.releases,
    version: filters.versions,
    serviceVersion: filters.serviceVersions,
    tag: filters.tags,
    userId: filters.userId,
    sessionId: filters.sessionId,
    traceId: filters.traceId,
    search: filters.search,
    minDurationMs: filters.minDurationMs,
    maxDurationMs: filters.maxDurationMs,
    minTotalTokens: filters.minTotalTokens,
    maxTotalTokens: filters.maxTotalTokens,
    minTotalCost: filters.minTotalCost,
    maxTotalCost: filters.maxTotalCost,
  };
  const traces = useQuery({
    queryKey: ["traces", project.id, filters],
    queryFn: () =>
      api<PaginatedPage<TraceSummary>>(
        `/api/v1/projects/${project.id}/traces?${queryString({
          ...requestFilters,
          page: filters.page,
          pageSize: filters.pageSize,
          sort: filters.sort,
          order: filters.order,
        })}`,
      ),
    refetchInterval: refreshMilliseconds(refreshInterval),
  });
  const facets = useQuery({
    queryKey: ["trace-facets", project.id, requestFilters],
    queryFn: () =>
      api<TraceFacets>(
        `/api/v1/projects/${project.id}/traces/facets?${queryString(requestFilters)}`,
      ),
    placeholderData: (previous) => previous,
    refetchInterval: refreshMilliseconds(refreshInterval),
  });
  const activeFilterCount = traceActiveFilterCount(filters);
  const clearFilters = () =>
    setFilters({
      statuses: [],
      services: [],
      names: [],
      models: [],
      environments: [],
      releases: [],
      versions: [],
      serviceVersions: [],
      tags: [],
      userId: undefined,
      sessionId: undefined,
      traceId: undefined,
      search: undefined,
      minDurationMs: undefined,
      maxDurationMs: undefined,
      minTotalTokens: undefined,
      maxTotalTokens: undefined,
      minTotalCost: undefined,
      maxTotalCost: undefined,
    });
  const table = (
    <TraceExplorerTable
      filters={filters}
      searchDraft={searchDraft}
      onSearchChange={setSearchDraft}
      data={traces.data}
      loading={traces.isLoading}
      error={traces.error}
      activeFilterCount={activeFilterCount}
      onOpenMobileFilters={() => setMobileFiltersOpen(true)}
      onChange={(changes, resetPage) => setFilters(changes, resetPage)}
      actions={
        <>
          <RangeSelector value={filters.range} onChange={(value) => setFilters({ range: value })} />
          <LiveBadge interval={refreshInterval} onIntervalChange={setRefreshInterval} />
        </>
      }
    />
  );
  const filterPanel = (
    <TraceFilterPanel
      filters={filters}
      facets={facets.data}
      loading={facets.isLoading}
      error={facets.error}
      activeCount={activeFilterCount}
      onChange={(changes) => setFilters(changes)}
      onClear={clearFilters}
      onCollapse={() => setFilterPanelCollapsed(true)}
    />
  );
  return (
    <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="hidden min-h-[620px] flex-1 overflow-hidden md:flex">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel
            key={filterPanelCollapsed ? "collapsed" : "expanded"}
            id="trace-filters"
            defaultSize={filterPanelCollapsed ? "40px" : "280px"}
            minSize={filterPanelCollapsed ? "40px" : "200px"}
            maxSize={filterPanelCollapsed ? "40px" : "420px"}
            disabled={filterPanelCollapsed}
          >
            {filterPanelCollapsed ? (
              <div className="flex h-full flex-col items-center border-r bg-muted/20 py-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Show filters"
                  onClick={() => setFilterPanelCollapsed(false)}
                >
                  <SlidersHorizontal />
                </Button>
                {activeFilterCount > 0 ? (
                  <Badge className="mt-2 px-1.5" variant="secondary">
                    {activeFilterCount}
                  </Badge>
                ) : null}
              </div>
            ) : (
              filterPanel
            )}
          </ResizablePanel>
          {!filterPanelCollapsed ? <ResizableHandle withHandle /> : null}
          <ResizablePanel id="trace-results" minSize="50%">
            {table}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      <div className="overflow-hidden md:hidden">{table}</div>
      <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
        <SheetContent side="bottom" className="h-[85svh] gap-0 p-0">
          <SheetTitle className="sr-only">Trace filters</SheetTitle>
          {filterPanel}
        </SheetContent>
      </Sheet>
    </main>
  );
}

const traceColumnLabels: Record<TraceColumnId, string> = {
  startedAt: "Started",
  trace: "Trace",
  status: "Status",
  durationMs: "Latency",
  totalCost: "Total cost",
  model: "Model",
  totalTokens: "Total tokens",
  environment: "Environment",
  userId: "User",
  sessionId: "Session",
  serviceName: "Service",
  release: "Release",
  version: "Trace version",
  serviceVersion: "Service version",
  inputCost: "Input cost",
  outputCost: "Output cost",
  inputTokens: "Input tokens",
  outputTokens: "Output tokens",
  spanCount: "Spans",
  generationCount: "Generations",
  toolCount: "Tools",
  tags: "Tags",
  endedAt: "Ended",
  traceId: "Trace ID",
};

export function TraceExplorerTable(props: {
  filters: ResolvedTracesSearch;
  searchDraft: string;
  onSearchChange: (value: string) => void;
  data?: PaginatedPage<TraceSummary>;
  loading: boolean;
  error: unknown;
  activeFilterCount: number;
  onOpenMobileFilters: () => void;
  onChange: (changes: Partial<TracesSearch>, resetPage?: boolean) => void;
  actions?: ReactNode;
}) {
  const sort = (field: TraceSortField) =>
    props.onChange({
      sort: field,
      order: props.filters.sort === field && props.filters.order === "desc" ? "asc" : "desc",
    });
  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <Button
          variant="outline"
          size="sm"
          className="md:hidden"
          onClick={props.onOpenMobileFilters}
        >
          <SlidersHorizontal /> Filters
          {props.activeFilterCount > 0 ? (
            <Badge variant="secondary">{props.activeFilterCount}</Badge>
          ) : null}
        </Button>
        <div className="relative min-w-52 flex-1">
          <Search className="absolute top-2 left-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            aria-label="Search traces"
            placeholder="Search trace name or ID"
            value={props.searchDraft}
            onChange={(event) => props.onSearchChange(event.target.value)}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
            Columns <ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              {traceColumnIds.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column}
                  checked={props.filters.columns.includes(column)}
                  disabled={column === "trace"}
                  onCheckedChange={(checked) =>
                    props.onChange(
                      {
                        columns: checked
                          ? traceColumnIds.filter(
                              (item) => props.filters.columns.includes(item) || item === column,
                            )
                          : props.filters.columns.filter((item) => item !== column),
                      },
                      false,
                    )
                  }
                >
                  {traceColumnLabels[column]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => props.onChange({ columns: defaultTraceColumns }, false)}
            >
              Reset columns
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {props.actions}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {props.error ? (
          <div className="p-4">
            <ErrorAlert error={props.error} />
          </div>
        ) : props.loading ? (
          <LoadingRows />
        ) : props.data?.items.length ? (
          <TraceDataTable
            traces={props.data.items}
            visibleColumns={props.filters.columns}
            sort={props.filters.sort}
            order={props.filters.order}
            onSort={sort}
          />
        ) : (
          <EmptyState
            icon={<Activity />}
            title="No traces found"
            text="Try another filter or send telemetry to this project."
          />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2 text-sm">
        <span className="text-muted-foreground">
          {props.data ? `${formatNumber(props.data.total)} traces` : "Loading traces"}
        </span>
        <div className="flex items-center gap-3">
          <NativeSelect
            aria-label="Rows per page"
            value={String(props.filters.pageSize)}
            onChange={(event) =>
              props.onChange({ pageSize: Number(event.target.value) as 25 | 50 | 100 })
            }
          >
            <NativeSelectOption value="25">25 rows</NativeSelectOption>
            <NativeSelectOption value="50">50 rows</NativeSelectOption>
            <NativeSelectOption value="100">100 rows</NativeSelectOption>
          </NativeSelect>
          <span className="whitespace-nowrap">
            Page {props.filters.page} of {Math.max(1, props.data?.pageCount ?? 1)}
          </span>
          <Pagination className="w-auto">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  aria-disabled={props.filters.page <= 1}
                  className={cn(props.filters.page <= 1 && "pointer-events-none opacity-50")}
                  onClick={(event) => {
                    event.preventDefault();
                    props.onChange({ page: Math.max(1, props.filters.page - 1) }, false);
                  }}
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  aria-disabled={props.filters.page >= (props.data?.pageCount ?? 0)}
                  className={cn(
                    props.filters.page >= (props.data?.pageCount ?? 0) &&
                      "pointer-events-none opacity-50",
                  )}
                  onClick={(event) => {
                    event.preventDefault();
                    props.onChange({ page: props.filters.page + 1 }, false);
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>
    </div>
  );
}

type TraceFacetFilterField =
  | "statuses"
  | "services"
  | "names"
  | "models"
  | "environments"
  | "releases"
  | "versions"
  | "serviceVersions"
  | "tags";

const traceFacetSections: Array<{
  id: keyof TraceFacets;
  field: TraceFacetFilterField;
  label: string;
}> = [
  { id: "status", field: "statuses", label: "Status" },
  { id: "environment", field: "environments", label: "Environment" },
  { id: "name", field: "names", label: "Trace name" },
  { id: "service", field: "services", label: "Service" },
  { id: "model", field: "models", label: "Model" },
  { id: "release", field: "releases", label: "Release" },
  { id: "version", field: "versions", label: "Trace version" },
  { id: "serviceVersion", field: "serviceVersions", label: "Service version" },
  { id: "tag", field: "tags", label: "Tags" },
];

function TraceFilterPanel(props: {
  filters: ResolvedTracesSearch;
  facets?: TraceFacets;
  loading: boolean;
  error: unknown;
  activeCount: number;
  onChange: (changes: Partial<TracesSearch>) => void;
  onClear: () => void;
  onCollapse: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-3">
        <div className="flex items-center gap-2">
          <span className="font-medium">Filters</span>
          {props.activeCount > 0 ? <Badge variant="secondary">{props.activeCount}</Badge> : null}
        </div>
        <div className="flex items-center gap-1">
          {props.activeCount > 0 ? (
            <Button variant="ghost" size="sm" onClick={props.onClear}>
              Clear all
            </Button>
          ) : null}
          <Button
            className="hidden md:inline-flex"
            variant="ghost"
            size="icon-sm"
            aria-label="Hide filters"
            onClick={props.onCollapse}
          >
            <ArrowLeft />
          </Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-3 pb-5">
          {props.error ? <ErrorAlert error={props.error} /> : null}
          <Accordion multiple defaultValue={["status", "environment"]}>
            {traceFacetSections.map((section) => {
              const selected = props.filters[section.field] ?? [];
              const options = props.facets?.[section.id] ?? [];
              return (
                <AccordionItem key={section.id} value={section.id}>
                  <AccordionTrigger>
                    <span className="flex items-center gap-2">
                      {section.label}
                      {selected.length > 0 ? (
                        <Badge variant="secondary">{selected.length}</Badge>
                      ) : null}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    {props.loading ? (
                      <div className="grid gap-2 py-1">
                        <Skeleton className="h-5 w-full" />
                        <Skeleton className="h-5 w-4/5" />
                      </div>
                    ) : options.length === 0 ? (
                      <p className="py-1 text-xs text-muted-foreground">No values in this range.</p>
                    ) : (
                      <div className="grid gap-1">
                        {options.map((option) => (
                          <label
                            key={option.value}
                            htmlFor={`facet-${section.id}-${option.value}`}
                            className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 hover:bg-muted"
                          >
                            <Checkbox
                              id={`facet-${section.id}-${option.value}`}
                              checked={selected.includes(option.value)}
                              onCheckedChange={(checked) =>
                                props.onChange({
                                  [section.field]: checked
                                    ? Array.from(new Set([...selected, option.value]))
                                    : selected.filter((value) => value !== option.value),
                                })
                              }
                            />
                            <span className="min-w-0 flex-1 truncate" title={option.value}>
                              {option.value}
                            </span>
                            <span className="font-mono text-xs text-muted-foreground">
                              {formatNumber(option.count)}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
          <div className="grid gap-4 border-t pt-4">
            <CommittedFilterInput
              label="Trace ID contains"
              value={props.filters.traceId}
              placeholder="Trace ID"
              onCommit={(traceId) => props.onChange({ traceId })}
            />
            <CommittedFilterInput
              label="User ID contains"
              value={props.filters.userId}
              placeholder="User ID"
              onCommit={(userId) => props.onChange({ userId })}
            />
            <CommittedFilterInput
              label="Session ID contains"
              value={props.filters.sessionId}
              placeholder="Session ID"
              onCommit={(sessionId) => props.onChange({ sessionId })}
            />
            <TraceRangeFilter
              label="Latency (ms)"
              minimum={props.filters.minDurationMs}
              maximum={props.filters.maxDurationMs}
              onCommit={(minDurationMs, maxDurationMs) =>
                props.onChange({ minDurationMs, maxDurationMs })
              }
            />
            <TraceRangeFilter
              label="Total tokens"
              minimum={props.filters.minTotalTokens}
              maximum={props.filters.maxTotalTokens}
              integer
              onCommit={(minTotalTokens, maxTotalTokens) =>
                props.onChange({ minTotalTokens, maxTotalTokens })
              }
            />
            <TraceRangeFilter
              label="Total cost (USD)"
              minimum={props.filters.minTotalCost}
              maximum={props.filters.maxTotalCost}
              step="0.0001"
              onCommit={(minTotalCost, maxTotalCost) =>
                props.onChange({ minTotalCost, maxTotalCost })
              }
            />
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function CommittedFilterInput(props: {
  label: string;
  value?: string;
  placeholder: string;
  onCommit: (value: string | undefined) => void;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5 text-xs font-medium">
      <label htmlFor={id}>{props.label}</label>
      <Input
        id={id}
        key={props.value ?? ""}
        defaultValue={props.value ?? ""}
        placeholder={props.placeholder}
        onBlur={(event) => props.onCommit(event.target.value.trim() || undefined)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </div>
  );
}

function TraceRangeFilter(props: {
  label: string;
  minimum?: number;
  maximum?: number;
  integer?: boolean;
  step?: string;
  onCommit: (minimum: number | undefined, maximum: number | undefined) => void;
}) {
  const commit = (container: HTMLFieldSetElement) => {
    const values = Array.from(container.querySelectorAll("input")).map((input) =>
      input.value.length === 0 ? undefined : Number(input.value),
    );
    props.onCommit(values[0], values[1]);
  };
  return (
    <fieldset
      key={`${props.minimum ?? ""}-${props.maximum ?? ""}`}
      className="grid gap-1.5 text-xs font-medium"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) commit(event.currentTarget);
      }}
    >
      <legend>{props.label}</legend>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Input
          type="number"
          min="0"
          step={props.step ?? (props.integer ? "1" : "any")}
          defaultValue={props.minimum}
          placeholder="Min"
        />
        <span className="text-muted-foreground">to</span>
        <Input
          type="number"
          min="0"
          step={props.step ?? (props.integer ? "1" : "any")}
          defaultValue={props.maximum}
          placeholder="Max"
        />
      </div>
    </fieldset>
  );
}

function traceActiveFilterCount(filters: ResolvedTracesSearch): number {
  const facets = [
    filters.statuses,
    filters.services,
    filters.names,
    filters.models,
    filters.environments,
    filters.releases,
    filters.versions,
    filters.serviceVersions,
    filters.tags,
  ];
  return (
    facets.filter((values) => (values?.length ?? 0) > 0).length +
    [
      filters.userId,
      filters.sessionId,
      filters.traceId,
      filters.search,
      filters.minDurationMs,
      filters.maxDurationMs,
      filters.minTotalTokens,
      filters.maxTotalTokens,
      filters.minTotalCost,
      filters.maxTotalCost,
    ].filter((value) => value !== undefined).length
  );
}

function TraceNameCell({ trace }: { trace: TraceSummary }) {
  const { project } = useProject();
  return (
    <Link
      className="flex items-center gap-3 font-medium hover:underline"
      to="/$projectId/traces/$traceId"
      params={{ projectId: project.id, traceId: trace.traceId }}
    >
      <ObservationIcon kind={trace.generationCount > 0 ? "generation" : "span"} />
      <span className="grid">
        <span>{trace.name}</span>
        <span className="font-mono text-xs font-normal text-muted-foreground">
          {shortId(trace.traceId)} · {trace.spanCount} spans
        </span>
      </span>
    </Link>
  );
}

function TraceOpenCell({ trace }: { trace: TraceSummary }) {
  const { project } = useProject();
  return (
    <Link
      className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
      to="/$projectId/traces/$traceId"
      params={{ projectId: project.id, traceId: trace.traceId }}
      aria-label={`Open ${trace.name}`}
    >
      <ChevronRight />
    </Link>
  );
}

function TraceDataTable(props: {
  traces: TraceSummary[];
  visibleColumns?: TraceColumnId[];
  sort?: TraceSortField;
  order?: "asc" | "desc";
  onSort?: (sort: TraceSortField) => void;
}) {
  const { project } = useProject();
  const columns = useMemo(
    () =>
      traceTableColumns({
        visible: props.visibleColumns ?? defaultTraceColumns,
        sort: props.sort,
        order: props.order,
        onSort: props.onSort,
      }),
    [props.visibleColumns, props.sort, props.order, props.onSort],
  );
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data: props.traces,
    getRowId: (trace) => trace.traceId,
  });
  return (
    <div className="min-h-0 w-full flex-1 overflow-auto">
      <Table className="w-full">
        <TableHeader className="sticky top-0 z-10 bg-background">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const direction = header.column.getIsSorted();
                return (
                  <TableHead
                    key={header.id}
                    aria-sort={
                      direction === "asc"
                        ? "ascending"
                        : direction === "desc"
                          ? "descending"
                          : undefined
                    }
                  >
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getAllCells().map((cell) => {
                const content = <table.FlexRender cell={cell} />;
                return (
                  <TableCell key={cell.id}>
                    {cell.column.id === "trace" || cell.column.id === "open" ? (
                      content
                    ) : (
                      <Link
                        className="-m-2 block p-2 text-inherit"
                        to="/$projectId/traces/$traceId"
                        params={{ projectId: project.id, traceId: row.original.traceId }}
                        aria-label={`Open ${row.original.name}`}
                      >
                        {content}
                      </Link>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function SessionsPage() {
  const { project } = useProject();
  const [search, setSearch] = useState("");
  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>("5s");
  const range = timeRange(24);
  const sessions = useQuery({
    queryKey: ["sessions", project.id, search],
    queryFn: () =>
      api<{ items: SessionSummary[] }>(
        `/api/v1/projects/${project.id}/sessions?${queryString({ ...range, search, limit: 100 })}`,
      ),
    refetchInterval: refreshMilliseconds(refreshInterval),
  });
  return (
    <Page
      title="Sessions"
      description="Follow related traces across an end-to-end user interaction"
      action={<LiveBadge interval={refreshInterval} onIntervalChange={setRefreshInterval} />}
    >
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute top-2 left-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-8"
                aria-label="Search sessions"
                placeholder="Search session or user ID"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {sessions.isLoading ? (
            <LoadingRows />
          ) : sessions.data?.items.length ? (
            <SessionDataTable sessions={sessions.data.items} />
          ) : (
            <EmptyState
              icon={<MessagesSquare />}
              title="No sessions found"
              text="Sessions appear when traces include an OpenTelemetry session ID."
            />
          )}
        </CardContent>
      </Card>
    </Page>
  );
}

function SessionNameCell({ session }: { session: SessionSummary }) {
  const { project } = useProject();
  return (
    <Link
      className="flex items-center gap-3 font-medium hover:underline"
      to="/$projectId/sessions/$sessionId"
      params={{ projectId: project.id, sessionId: session.sessionId }}
    >
      <MessagesSquare className="size-4 text-muted-foreground" />
      <span className="font-mono">{session.sessionId}</span>
    </Link>
  );
}

function SessionOpenCell({ session }: { session: SessionSummary }) {
  const { project } = useProject();
  return (
    <Link
      className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
      to="/$projectId/sessions/$sessionId"
      params={{ projectId: project.id, sessionId: session.sessionId }}
      aria-label={`Open session ${session.sessionId}`}
    >
      <ChevronRight />
    </Link>
  );
}

function SessionDataTable({ sessions }: { sessions: SessionSummary[] }) {
  const table = useTable({
    features: dataTableFeatures,
    columns: sessionColumns,
    data: sessions,
    getRowId: (session) => session.sessionId,
  });
  return (
    <div className="w-full overflow-x-auto">
      <Table className="w-full">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const direction = header.column.getIsSorted();
                return (
                  <TableHead
                    key={header.id}
                    aria-sort={
                      direction === "asc"
                        ? "ascending"
                        : direction === "desc"
                          ? "descending"
                          : undefined
                    }
                  >
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id}>
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function SessionDetailPage() {
  const { project } = useProject();
  const { sessionId } = useParams({ from: "/$projectId/sessions/$sessionId" });
  const session = useQuery({
    queryKey: ["session", project.id, sessionId],
    queryFn: () => api<SessionDetail>(`/api/v1/projects/${project.id}/sessions/${sessionId}`),
    refetchInterval: 5_000,
  });
  if (session.isLoading)
    return <FullPageMessage icon={<MessagesSquare />} text="Loading session" contained />;
  if (session.data === undefined)
    return <FullPageMessage icon={<AlertCircle />} text="Session not found" contained />;
  const detail = session.data;
  return (
    <Page
      title={detail.summary.sessionId}
      description={
        detail.summary.userId ? `User ${detail.summary.userId}` : "Traces in this session"
      }
      action={
        <Link
          className={buttonVariants({ variant: "outline" })}
          to="/$projectId/sessions"
          params={{ projectId: project.id }}
        >
          <ArrowLeft /> Back
        </Link>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Traces">{formatNumber(detail.summary.traceCount)}</SummaryCard>
        <SummaryCard label="Errors">{formatNumber(detail.summary.errorCount)}</SummaryCard>
        <SummaryCard label="Spans">{formatNumber(detail.summary.spanCount)}</SummaryCard>
        <SummaryCard label="Duration">{formatDuration(detail.summary.durationMs)}</SummaryCard>
        <SummaryCard label="Tokens">{formatNumber(detail.summary.totalTokens)}</SummaryCard>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Traces</CardTitle>
          <CardDescription>All traces carrying this session ID</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <TraceDataTable traces={detail.traces} />
        </CardContent>
      </Card>
    </Page>
  );
}

export function TraceDetailPage() {
  const { project } = useProject();
  const { traceId } = useParams({ from: "/$projectId/traces/$traceId" });
  const search = useSearch({ from: "/$projectId/traces/$traceId" });
  const navigate = useNavigate();
  const trace = useQuery({
    queryKey: ["trace", project.id, traceId],
    queryFn: () => api<TraceDetail>(`/api/v1/projects/${project.id}/traces/${traceId}`),
    refetchInterval: 5_000,
  });
  const detail = trace.data;
  const selectedSpanExists =
    search.span === undefined || detail?.spans.some((span) => span.spanId === search.span) === true;
  useEffect(() => {
    if (detail === undefined || selectedSpanExists) return;
    void navigate({
      to: "/$projectId/traces/$traceId",
      params: { projectId: project.id, traceId },
      search: { ...search, span: undefined },
      replace: true,
    });
  }, [detail, navigate, project.id, search, selectedSpanExists, traceId]);
  if (trace.isLoading)
    return <FullPageMessage icon={<Activity />} text="Loading trace" contained />;
  if (detail === undefined)
    return <FullPageMessage icon={<AlertCircle />} text="Trace not found" contained />;
  return (
    <TraceDetailExplorer
      key={detail.summary.traceId}
      detail={detail}
      projectId={project.id}
      selectedSpanId={search.span}
      view={search.view ?? "tree"}
      onSelectSpan={(span) => {
        void navigate({
          to: "/$projectId/traces/$traceId",
          params: { projectId: project.id, traceId },
          search: { ...search, span },
        });
      }}
      onViewChange={(view) => {
        void navigate({
          to: "/$projectId/traces/$traceId",
          params: { projectId: project.id, traceId },
          search: { ...search, view: view === "tree" ? undefined : view },
        });
      }}
    />
  );
}

export function OnboardingPage() {
  const { project } = useProject();
  const [copied, setCopied] = useState<string | null>(null);
  const baseUrl = window.location.origin;
  const snippets = {
    environment: `LANGFUSE_BASE_URL=${baseUrl}\nLANGFUSE_PUBLIC_KEY=<YOUR_PUBLIC_KEY>\nLANGFUSE_SECRET_KEY=<YOUR_SECRET_KEY>\nLANGFUSE_MEDIA_UPLOAD_ENABLED=false`,
    langfuse: `import { LangfuseSpanProcessor } from "@langfuse/otel";\nimport { startObservation } from "@langfuse/tracing";\nimport { NodeSDK } from "@opentelemetry/sdk-node";\n\nconst sdk = new NodeSDK({\n  spanProcessors: [new LangfuseSpanProcessor()],\n});\nsdk.start();\n\nconst agent = startObservation("support-agent", {\n  input: { message: "Hello" },\n}, { asType: "agent" });\nagent.end();\nawait sdk.shutdown();`,
    anvía: `import { langfuse } from "@anvia/langfuse";\n\nexport const tracing = langfuse.create({\n  serviceName: "my-agent",\n});\n\n// Pass tracing to an Anvia agent with .observe(tracing).\n// Call await tracing.shutdown() before a short-lived process exits.`,
  };
  const copy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    notify("Copied to clipboard");
    setTimeout(() => setCopied(null), 1500);
  };
  return (
    <Page
      title="Connect an application"
      description={`Send Langfuse OTLP traces to ${project.name}`}
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Step
          number="01"
          title="Create an ingestion key"
          text="Generate a project-scoped key in Settings. The secret is shown once."
        />
        <Step
          number="02"
          title="Configure your exporter"
          text="Use the standard Langfuse base URL, public key, and secret key variables."
        />
        <Step
          number="03"
          title="Run your application"
          text="Traces normally appear in the explorer within a few seconds."
        />
      </div>
      <Tabs defaultValue="environment">
        <TabsList>
          <TabsTrigger value="environment">Environment</TabsTrigger>
          <TabsTrigger value="langfuse">Langfuse OTEL</TabsTrigger>
          <TabsTrigger value="anvia">Anvia</TabsTrigger>
        </TabsList>
        <TabsContent value="environment">
          <CodeBlock
            title="Environment"
            code={snippets.environment}
            copied={copied === "env"}
            onCopy={() => copy("env", snippets.environment)}
          />
        </TabsContent>
        <TabsContent value="langfuse">
          <CodeBlock
            title="@langfuse/otel"
            code={snippets.langfuse}
            copied={copied === "langfuse"}
            onCopy={() => copy("langfuse", snippets.langfuse)}
          />
        </TabsContent>
        <TabsContent value="anvia">
          <CodeBlock
            title="@anvia/langfuse"
            code={snippets.anvía}
            copied={copied === "anvia"}
            onCopy={() => copy("anvia", snippets.anvía)}
          />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

export function ProjectsPage() {
  const { project, projects, selectProject } = useProject();
  const queryClient = useQueryClient();
  const directory = useQuery({
    queryKey: ["team"],
    queryFn: () => api<TeamDirectory>("/api/v1/team"),
  });
  const [projectName, setProjectName] = useState("");
  const [projectSlug, setProjectSlug] = useState("");
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviteMemberOpen, setInviteMemberOpen] = useState(false);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [removeMemberId, setRemoveMemberId] = useState<string | null>(null);

  const invalidateDirectory = () => queryClient.invalidateQueries({ queryKey: ["team"] });
  const createProject = useMutation({
    mutationFn: () =>
      api<Project>("/api/v1/projects", {
        method: "POST",
        body: JSON.stringify({
          name: projectName,
          slug: projectSlug,
        }),
      }),
    onSuccess: async (created) => {
      setProjectName("");
      setProjectSlug("");
      setCreateProjectOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      selectProject(created.id);
      notify("Project created");
    },
  });
  const deleteProject = useMutation({
    mutationFn: (projectId: string) =>
      api<void>(`/api/v1/projects/${projectId}`, { method: "DELETE" }),
    onSuccess: async () => {
      setDeleteProjectId(null);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      notify("Project deletion queued");
    },
  });
  const inviteMember = useMutation({
    mutationFn: () =>
      api<TeamInvitation>("/api/auth/organization/invite-member", {
        method: "POST",
        body: JSON.stringify({
          organizationId: directory.data?.organizationId,
          email: inviteEmail,
          role: inviteRole,
        }),
      }),
    onSuccess: async () => {
      setInviteEmail("");
      setInviteMemberOpen(false);
      await invalidateDirectory();
      notify("Invitation sent");
    },
  });
  const updateRole = useMutation({
    mutationFn: (input: { memberId: string; role: "admin" | "member" }) =>
      api<{ id: string; role: string }>(`/api/v1/team/members/${input.memberId}`, {
        method: "PATCH",
        body: JSON.stringify({ role: input.role }),
      }),
    onSuccess: async () => {
      await invalidateDirectory();
      notify("Member role updated");
    },
  });
  const removeMember = useMutation({
    mutationFn: (memberId: string) =>
      api<void>(`/api/v1/team/members/${memberId}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      setRemoveMemberId(null);
      await invalidateDirectory();
      notify("Member removed");
    },
  });
  const cancelInvitation = useMutation({
    mutationFn: (invitationId: string) =>
      api<unknown>("/api/auth/organization/cancel-invitation", {
        method: "POST",
        body: JSON.stringify({ invitationId }),
      }),
    onSuccess: async () => {
      await invalidateDirectory();
      notify("Invitation canceled", "info");
    },
  });
  const managementError =
    deleteProject.error ?? updateRole.error ?? removeMember.error ?? cancelInvitation.error;

  return (
    <Page
      className="mx-auto max-w-2xl"
      title="Projects"
      description="Choose a project to open its observability dashboard"
    >
      {managementError ? <ErrorAlert error={managementError} /> : null}
      <Tabs defaultValue="projects">
        <TabsList>
          <TabsTrigger value="projects">
            <Layers3 /> Projects
          </TabsTrigger>
          <TabsTrigger value="members">
            <Users /> Team
          </TabsTrigger>
        </TabsList>
        <TabsContent value="projects">
          <Card>
            <CardHeader>
              <CardTitle>Projects</CardTitle>
              <CardDescription>
                Telemetry, settings, and ingestion keys are isolated per project.
              </CardDescription>
              {directory.data?.canManage ? (
                <CardAction>
                  <Button size="sm" onClick={() => setCreateProjectOpen(true)}>
                    <Plus /> Create project
                  </Button>
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent className="grid gap-2">
              {projects.map((item) => (
                <div className="flex items-center gap-3 rounded-lg border p-3" key={item.id}>
                  <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
                    <Layers3 className="size-4" />
                  </span>
                  <button
                    className="grid min-w-0 flex-1 text-left"
                    type="button"
                    onClick={() => selectProject(item.id)}
                  >
                    <span className="truncate text-sm font-medium">{item.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {item.slug} · {item.state}
                    </span>
                  </button>
                  {item.id === project.id ? <Badge>Current</Badge> : null}
                  {directory.data?.canManage ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${item.name}`}
                      onClick={() => setDeleteProjectId(item.id)}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
              ))}
              {projects.length === 0 ? (
                <EmptyState
                  icon={<Layers3 />}
                  title="No projects yet"
                  text="Create your first telemetry project."
                />
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle>Team members</CardTitle>
              <CardDescription>
                Owners and admins can invite people and update roles.
              </CardDescription>
              {directory.data?.canManage ? (
                <CardAction>
                  <Button size="sm" onClick={() => setInviteMemberOpen(true)}>
                    <MailPlus /> Add member
                  </Button>
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {directory.data?.members.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="size-8">
                            <AvatarFallback>{item.name.slice(0, 1).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <span className="grid">
                            <span className="font-medium">
                              {item.name}
                              {item.isCurrentUser ? " (you)" : ""}
                            </span>
                            <span className="text-xs text-muted-foreground">{item.email}</span>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {directory.data?.canManage && item.role !== "owner" ? (
                          <NativeSelect
                            size="sm"
                            value={item.role}
                            disabled={updateRole.isPending}
                            onChange={(event) =>
                              updateRole.mutate({
                                memberId: item.id,
                                role: event.target.value as "admin" | "member",
                              })
                            }
                          >
                            <NativeSelectOption value="member">Member</NativeSelectOption>
                            <NativeSelectOption value="admin">Admin</NativeSelectOption>
                          </NativeSelect>
                        ) : (
                          <Badge variant="secondary">{item.role}</Badge>
                        )}
                      </TableCell>
                      <TableCell>{new Date(item.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {directory.data?.canManage &&
                        item.role !== "owner" &&
                        !item.isCurrentUser ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${item.name}`}
                            onClick={() => setRemoveMemberId(item.id)}
                          >
                            <X />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
            {directory.data?.canManage &&
            directory.data.invitations.some((item) => item.status === "pending") ? (
              <CardFooter className="grid gap-2">
                <p className="text-sm font-medium">Pending invitations</p>
                {directory.data.invitations
                  .filter((item) => item.status === "pending")
                  .map((item) => (
                    <div className="flex w-full items-center gap-3" key={item.id}>
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate text-sm">{item.email}</span>
                        <span className="text-xs text-muted-foreground">
                          {item.role ?? "member"} · expires{" "}
                          {new Date(item.expiresAt).toLocaleDateString()}
                        </span>
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={cancelInvitation.isPending}
                        onClick={() => cancelInvitation.mutate(item.id)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ))}
              </CardFooter>
            ) : null}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={createProjectOpen}
        onOpenChange={(open) => {
          setCreateProjectOpen(open);
          if (!open) createProject.reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
            <DialogDescription>
              Create an isolated destination for telemetry, settings, and ingestion keys.
            </DialogDescription>
          </DialogHeader>
          {createProject.error ? <ErrorAlert error={createProject.error} /> : null}
          <form
            id="create-project-form"
            onSubmit={(event) => {
              event.preventDefault();
              createProject.mutate();
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="project-name">Name</FieldLabel>
                <Input
                  id="project-name"
                  required
                  autoFocus
                  placeholder="Production agents"
                  value={projectName}
                  onChange={(event) => {
                    setProjectName(event.target.value);
                    setProjectSlug(slugify(event.target.value));
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="project-slug">Slug</FieldLabel>
                <Input
                  id="project-slug"
                  required
                  placeholder="production-agents"
                  value={projectSlug}
                  onChange={(event) => setProjectSlug(event.target.value)}
                />
              </Field>
            </FieldGroup>
          </form>
          <DialogFooter showCloseButton>
            <Button form="create-project-form" type="submit" disabled={createProject.isPending}>
              <Plus /> Create project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={inviteMemberOpen}
        onOpenChange={(open) => {
          setInviteMemberOpen(open);
          if (!open) inviteMember.reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add team member</DialogTitle>
            <DialogDescription>
              Send an invitation to give someone access to the team's projects.
            </DialogDescription>
          </DialogHeader>
          {inviteMember.error ? <ErrorAlert error={inviteMember.error} /> : null}
          <form
            id="invite-member-form"
            onSubmit={(event) => {
              event.preventDefault();
              inviteMember.mutate();
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="invite-email">Email</FieldLabel>
                <Input
                  id="invite-email"
                  required
                  autoFocus
                  type="email"
                  placeholder="teammate@company.com"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="invite-role">Role</FieldLabel>
                <NativeSelect
                  id="invite-role"
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value as "admin" | "member")}
                  className="w-full"
                >
                  <NativeSelectOption value="member">Member</NativeSelectOption>
                  <NativeSelectOption value="admin">Admin</NativeSelectOption>
                </NativeSelect>
              </Field>
            </FieldGroup>
          </form>
          <DialogFooter showCloseButton>
            <Button form="invite-member-form" type="submit" disabled={inviteMember.isPending}>
              <MailPlus /> Send invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteProjectId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteProjectId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              Ingestion stops immediately and the worker permanently removes its traces, keys, and
              settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteProject.isPending}
              onClick={() => {
                if (deleteProjectId) deleteProject.mutate(deleteProjectId);
              }}
            >
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={removeMemberId !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveMemberId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this member?</AlertDialogTitle>
            <AlertDialogDescription>
              They will immediately lose access to every project in Anvia Lens.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={removeMember.isPending}
              onClick={() => {
                if (removeMemberId) removeMember.mutate(removeMemberId);
              }}
            >
              Remove member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}

export function AcceptInvitationPage() {
  const { invitationId } = useParams({ from: "/accept-invitation/$invitationId" });
  const invitation = useQuery({
    queryKey: ["invitation", invitationId],
    queryFn: () =>
      api<{
        id: string;
        email: string;
        role: string | null;
        status: string;
        expiresAt: string;
        organizationName: string;
      }>(`/api/v1/invitations/${invitationId}`),
  });
  const accept = useMutation({
    mutationFn: () =>
      api<unknown>("/api/auth/organization/accept-invitation", {
        method: "POST",
        body: JSON.stringify({ invitationId }),
      }),
    onSuccess: () => window.location.assign("/"),
  });
  const reject = useMutation({
    mutationFn: () =>
      api<unknown>("/api/auth/organization/reject-invitation", {
        method: "POST",
        body: JSON.stringify({ invitationId }),
      }),
    onSuccess: () => window.location.assign("/"),
  });
  if (invitation.isLoading)
    return <FullPageMessage icon={<MailPlus />} text="Loading invitation" />;
  if (invitation.isError || invitation.data === undefined)
    return <FullPageMessage icon={<AlertCircle />} text="This invitation is unavailable" />;
  const detail = invitation.data;
  const expired = Date.parse(detail.expiresAt) <= Date.now();
  const actionable = detail.status === "pending" && !expired;
  return (
    <CenteredCard
      icon={<MailPlus />}
      eyebrow="Team invitation"
      title={`Join ${detail.organizationName}`}
      description={
        <>
          You were invited as <strong>{detail.role ?? "member"}</strong>. Accept to access this
          team's projects.
        </>
      }
    >
      {!actionable ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Invitation unavailable</AlertTitle>
          <AlertDescription>
            This invitation is {expired ? "expired" : detail.status}.
          </AlertDescription>
        </Alert>
      ) : null}
      {(accept.error ?? reject.error) ? <ErrorAlert error={accept.error ?? reject.error} /> : null}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={!actionable || accept.isPending}
          onClick={() => accept.mutate()}
        >
          <Check /> Accept
        </Button>
        <Button
          className="flex-1"
          variant="outline"
          disabled={!actionable || reject.isPending}
          onClick={() => reject.mutate()}
        >
          Decline
        </Button>
      </div>
    </CenteredCard>
  );
}

export function SettingsPage() {
  const { project } = useProject();
  const queryClient = useQueryClient();
  const keys = useQuery({
    queryKey: ["keys", project.id],
    queryFn: () => api<{ items: ProjectApiKey[] }>(`/api/v1/projects/${project.id}/keys`),
  });
  const [newKey, setNewKey] = useState<CreatedProjectApiKey | null>(null);
  const [keyName, setKeyName] = useState("Development");
  const [retention, setRetention] = useState(
    project.settings.retentionDays === null ? "unlimited" : String(project.settings.retentionDays),
  );
  const [patterns, setPatterns] = useState(project.settings.redactionPatterns.join("\n"));
  const createKey = useMutation({
    mutationFn: () =>
      api<CreatedProjectApiKey>(`/api/v1/projects/${project.id}/keys`, {
        method: "POST",
        body: JSON.stringify({ name: keyName }),
      }),
    onSuccess: (result) => {
      setNewKey(result);
      queryClient.invalidateQueries({ queryKey: ["keys", project.id] });
      notify("Ingestion key created");
    },
  });
  const saveSettings = useMutation({
    mutationFn: () =>
      api<Project>(`/api/v1/projects/${project.id}/settings`, {
        method: "PATCH",
        body: JSON.stringify({
          retentionDays: retention === "unlimited" ? null : Number(retention),
          redactionPatterns: patterns
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      notify("Data settings saved");
    },
  });
  return (
    <Page
      title="Project settings"
      description="Control ingestion access and telemetry data handling"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ingestion keys</CardTitle>
            <CardDescription>
              Keys authorize OTLP writes and cannot read trace data.
            </CardDescription>
            <CardAction>
              <KeyRound className="size-4" />
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex gap-2">
              <Input value={keyName} onChange={(event) => setKeyName(event.target.value)} />
              <Button disabled={createKey.isPending} onClick={() => createKey.mutate()}>
                Create key
              </Button>
            </div>
            {createKey.error ? <ErrorAlert error={createKey.error} /> : null}
            {newKey ? <SecretReveal credentials={newKey} onClose={() => setNewKey(null)} /> : null}
            <div className="grid gap-2">
              {keys.data?.items.map((key) => (
                <div className="flex items-center gap-3 rounded-lg border p-3" key={key.id}>
                  <span className="grid min-w-0 flex-1">
                    <span className="font-medium">{key.name}</span>
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {key.publicKey}
                    </span>
                  </span>
                  <StatusBadge status={key.revokedAt ? "error" : "ok"} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Retention</CardTitle>
            <CardDescription>
              Changes apply asynchronously to existing and future traces.
            </CardDescription>
            <CardAction>
              <Database className="size-4" />
            </CardAction>
          </CardHeader>
          <CardContent>
            <Field>
              <FieldLabel htmlFor="retention">Retention period</FieldLabel>
              <NativeSelect
                id="retention"
                value={retention}
                onChange={(event) => setRetention(event.target.value)}
                className="w-full"
              >
                <NativeSelectOption value="7">7 days</NativeSelectOption>
                <NativeSelectOption value="30">30 days</NativeSelectOption>
                <NativeSelectOption value="90">90 days</NativeSelectOption>
                <NativeSelectOption value="unlimited">Unlimited</NativeSelectOption>
              </NativeSelect>
              <FieldDescription>
                Expired traces are removed by the maintenance worker.
              </FieldDescription>
            </Field>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Attribute redaction</CardTitle>
            <CardDescription>
              One case-insensitive attribute glob per line. Matching values are replaced before
              queueing.
            </CardDescription>
            <CardAction>
              <Braces className="size-4" />
            </CardAction>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="patterns">Redaction patterns</FieldLabel>
                <Textarea
                  id="patterns"
                  rows={7}
                  value={patterns}
                  onChange={(event) => setPatterns(event.target.value)}
                  placeholder="metadata.secret\nanvia.run.prompt"
                />
                <FieldDescription>Redacted values cannot be recovered.</FieldDescription>
              </Field>
              {saveSettings.error ? <ErrorAlert error={saveSettings.error} /> : null}
              <Button
                className="self-end"
                disabled={saveSettings.isPending}
                onClick={() => saveSettings.mutate()}
              >
                {saveSettings.isPending ? <Spinner /> : saveSettings.isSuccess ? <Check /> : null}
                {saveSettings.isSuccess ? "Saved" : "Save data settings"}
              </Button>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}

function SetupPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await api<Project>("/api/v1/projects", {
        method: "POST",
        body: JSON.stringify({ name, slug }),
      });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Setup failed");
    }
  };
  return (
    <CenteredCard
      icon={<CircleDot />}
      eyebrow="First project"
      title="Create a project"
      description="Projects isolate ingestion keys and trace data."
    >
      <form className="grid gap-4" onSubmit={submit}>
        <Field>
          <FieldLabel htmlFor="setup-name">Name</FieldLabel>
          <Input
            id="setup-name"
            required
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setSlug(slugify(event.target.value));
            }}
            placeholder="Production agents"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="setup-slug">Slug</FieldLabel>
          <Input
            id="setup-slug"
            required
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="production-agents"
          />
        </Field>
        {error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit">
          Continue <ChevronRight />
        </Button>
      </form>
    </CenteredCard>
  );
}

function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    const result =
      mode === "signup"
        ? await authClient.signUp.email({
            name,
            email,
            password,
            callbackURL: window.location.href,
          })
        : await authClient.signIn.email({ email, password });
    if (result.error) setError(result.error.message ?? "Authentication failed");
    else if (mode === "signup") {
      setNotice("Account created. Check your email to verify it, then sign in here.");
      setMode("login");
    }
  };
  return (
    <CenteredCard
      icon={<CircleDot />}
      eyebrow="Welcome to Anvia Lens"
      title={mode === "login" ? "Sign in to continue" : "Create your account"}
      description="OpenTelemetry-native observability for AI systems."
    >
      <form className="grid gap-4" onSubmit={submit}>
        {mode === "signup" ? (
          <Field>
            <FieldLabel htmlFor="auth-name">Name</FieldLabel>
            <Input
              id="auth-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
            />
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor="auth-email">Email</FieldLabel>
          <Input
            id="auth-email"
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="auth-password">Password</FieldLabel>
          <Input
            id="auth-password"
            required
            minLength={8}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        </Field>
        {error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {notice ? (
          <Alert>
            <Check />
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit">
          {mode === "login" ? "Sign in" : "Create account"}
          <ChevronRight />
        </Button>
      </form>
      <Button variant="link" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
        {mode === "login" ? "Need an account? Create one" : "Already have an account? Sign in"}
      </Button>
    </CenteredCard>
  );
}

function CenteredCard(props: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <span className="mx-auto flex size-10 items-center justify-center rounded-full border bg-background text-foreground">
            {props.icon}
          </span>
          <Badge className="mx-auto mt-2" variant="secondary">
            {props.eyebrow}
          </Badge>
          <CardTitle className="mt-2 text-xl">{props.title}</CardTitle>
          <CardDescription>{props.description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">{props.children}</CardContent>
      </Card>
    </main>
  );
}

function Page(props: {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <main className={cn("flex w-full flex-1 flex-col gap-6 p-4 md:p-6", props.className)}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Observability
          </p>
          <h1 className="font-heading text-2xl font-medium tracking-tight">{props.title}</h1>
          <p className="text-sm text-muted-foreground">{props.description}</p>
        </div>
        {props.action}
      </header>
      {props.children}
    </main>
  );
}

function SummaryCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle>{children}</CardTitle>
      </CardHeader>
    </Card>
  );
}
function LiveBadge(props: {
  interval: RefreshInterval;
  onIntervalChange: (interval: RefreshInterval) => void;
}) {
  const queryClient = useQueryClient();

  return (
    <div className="flex items-center">
      <Button
        className="rounded-r-none border-r-0"
        variant="outline"
        size="sm"
        onClick={() => void queryClient.invalidateQueries()}
        title="Refresh now"
      >
        <Refresh />
        <span className="size-2 rounded-full bg-primary" />
        {props.interval === "Off" ? "Manual" : `Live · ${props.interval}`}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={buttonVariants({
            variant: "outline",
            size: "sm",
            className: "rounded-l-none px-1.5",
          })}
          aria-label="Refresh interval"
        >
          <ChevronDown />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-28">
          {(["5s", "10s", "30s", "Off"] satisfies RefreshInterval[]).map((value) => (
            <DropdownMenuItem key={value} onClick={() => props.onIntervalChange(value)}>
              {value === "Off" ? "Auto refresh off" : `Every ${value}`}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function StatusBadge({ status }: { status: "ok" | "error" | "unset" }) {
  return (
    <Badge variant={status === "error" ? "destructive" : status === "ok" ? "secondary" : "outline"}>
      {status === "ok" ? "Success" : status === "error" ? "Error" : "Unset"}
    </Badge>
  );
}

function ObservationIcon({ kind }: { kind: SpanDetail["observationKind"] }) {
  const Icon =
    kind === "generation" || kind === "embedding"
      ? Sparkles
      : kind === "tool"
        ? Zap
        : kind === "agent" || kind === "chain"
          ? Users
          : kind === "retriever"
            ? Search
            : kind === "evaluator" || kind === "guardrail"
              ? Check
              : kind === "event"
                ? Activity
                : Layers3;
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
      <Icon className="size-4" />
    </span>
  );
}

function Step(props: { number: string; title: string; text: string }) {
  return (
    <Card>
      <CardHeader>
        <Badge variant="secondary">{props.number}</Badge>
        <CardTitle>{props.title}</CardTitle>
        <CardDescription>{props.text}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function CodeBlock(props: { title: string; code: string; copied: boolean; onCopy: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
        <CardAction>
          <Button variant="outline" size="sm" onClick={props.onCopy}>
            {props.copied ? <Check /> : <Copy />}
            {props.copied ? "Copied" : "Copy"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-80 rounded-lg bg-muted p-4">
          <pre className="whitespace-pre-wrap font-mono text-xs">{props.code}</pre>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function SecretReveal(props: { credentials: CreatedProjectApiKey; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const environment = `LANGFUSE_BASE_URL=${window.location.origin}\nLANGFUSE_PUBLIC_KEY=${props.credentials.publicKey}\nLANGFUSE_SECRET_KEY=${props.credentials.secretKey}\nLANGFUSE_MEDIA_UPLOAD_ENABLED=false`;
  return (
    <Alert>
      <AlertCircle />
      <AlertTitle>Copy this key now</AlertTitle>
      <AlertDescription className="grid gap-3">
        <span>The secret key will not be shown again.</span>
        <code className="whitespace-pre-wrap break-all rounded-lg bg-muted p-3 font-mono text-xs">
          {environment}
        </code>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(environment);
              setCopied(true);
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy environment"}
          </Button>
          <Button size="sm" variant="ghost" onClick={props.onClose}>
            <X /> Close
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

function EmptyState(props: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <Empty className="min-h-64">
      <EmptyHeader>
        <EmptyMedia variant="icon">{props.icon}</EmptyMedia>
        <EmptyTitle>{props.title}</EmptyTitle>
        <EmptyDescription>{props.text}</EmptyDescription>
      </EmptyHeader>
      {props.action ? <EmptyContent>{props.action}</EmptyContent> : null}
    </Empty>
  );
}

function FullPageMessage(props: { icon: ReactNode; text: string; contained?: boolean }) {
  return (
    <div
      className={cn("flex items-center justify-center", props.contained ? "min-h-96" : "min-h-svh")}
    >
      <div className="grid justify-items-center gap-3 text-muted-foreground">
        <span className="animate-pulse">{props.icon}</span>
        <p className="text-sm">{props.text}</p>
      </div>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="grid gap-2 p-4">
      {[1, 2, 3, 4].map((item) => (
        <Skeleton className="h-14 w-full" key={item} />
      ))}
    </div>
  );
}
function ErrorAlert({ error }: { error: unknown }) {
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription>
        {error instanceof Error ? error.message : "Request failed"}
      </AlertDescription>
    </Alert>
  );
}
function timeRange(hours: number) {
  return {
    from: new Date(Date.now() - hours * 3_600_000).toISOString(),
    to: new Date().toISOString(),
  };
}
function timeRangeForPreset(range: MetricsRangePreset) {
  return timeRange(range === "24h" ? 24 : range === "7d" ? 24 * 7 : 24 * 30);
}
function parseMetricsRange(value: unknown): MetricsRangePreset {
  return metricsRangePresets.includes(value as MetricsRangePreset)
    ? (value as MetricsRangePreset)
    : "24h";
}
function optionalSearchValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
function searchValues(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return Array.from(
    new Set(
      values
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 50);
}
function optionalNonNegativeNumber(value: unknown): number | undefined {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
function positiveInteger(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function isTraceSortField(value: unknown): value is TraceSortField {
  return traceSortFields.includes(value as TraceSortField);
}
function validTraceColumns(value: unknown): TraceColumnId[] {
  const selected = new Set(searchValues(value));
  if (selected.size === 0) return defaultTraceColumns;
  selected.add("trace");
  return traceColumnIds.filter((column) => selected.has(column));
}
export function adaptiveRefreshInterval(range: MetricsRangePreset): RefreshInterval {
  return range === "24h" ? "5s" : "30s";
}
export function refreshMilliseconds(interval: RefreshInterval): number | false {
  return interval === "Off" ? false : Number.parseInt(interval, 10) * 1_000;
}
export function comparisonDelta(current: number, previous: number, mode: "relative" | "points") {
  if (mode === "points") {
    const change = (current - previous) * 100;
    const direction = change > 0 ? "up" : change < 0 ? "down" : "flat";
    const arrow = direction === "up" ? "↑" : direction === "down" ? "↓" : "→";
    return {
      direction,
      label: `${arrow} ${Math.abs(change).toFixed(1)} pp`,
      accessibleLabel: `${Math.abs(change).toFixed(1)} percentage points ${direction}`,
    } as const;
  }
  if (previous === 0 && current > 0) {
    return { direction: "up", label: "New", accessibleLabel: "New activity" } as const;
  }
  const change = previous === 0 ? 0 : (current - previous) / Math.abs(previous);
  const direction = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const arrow = direction === "up" ? "↑" : direction === "down" ? "↓" : "→";
  return {
    direction,
    label: `${arrow} ${Math.abs(change * 100).toFixed(1)}%`,
    accessibleLabel: `${Math.abs(change * 100).toFixed(1)} percent ${direction}`,
  } as const;
}
function formatNumber(value?: number) {
  return value === undefined
    ? "—"
    : new Intl.NumberFormat("en", { notation: value > 99_999 ? "compact" : "standard" }).format(
        value,
      );
}
function formatDecimal(value?: number) {
  return value === undefined
    ? "—"
    : new Intl.NumberFormat("en", { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value);
}
function formatCompactAxis(value: number | string) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(
    Number(value),
  );
}
function formatMetricTimestamp(value: string, range: MetricsRangePreset, detailed: boolean) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  if (detailed) {
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return range === "24h"
    ? date.toLocaleTimeString([], { hour: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}
function truncateChartLabel(value: string) {
  return value.length > 18 ? `${value.slice(0, 17)}…` : value;
}
function formatPercent(value?: number) {
  return value === undefined ? "—" : `${(value * 100).toFixed(1)}%`;
}
function formatDuration(value?: number) {
  if (value === undefined) return "—";
  if (value < 1) return `${Math.round(value * 1_000)}µs`;
  if (value < 1_000) return `${Math.round(value)}ms`;
  return `${(value / 1_000).toFixed(2)}s`;
}
function formatCost(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  if (value > 0 && value < 0.0001) return "<$0.0001";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 0.01 ? 4 : 2,
    maximumFractionDigits: value < 0.01 ? 6 : 4,
  }).format(value);
}
function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : value;
}
function shortId(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
function relativeTime(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1_000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}
function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
