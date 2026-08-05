import type {
  CreatedProjectApiKey,
  CursorPage,
  Metrics,
  Project,
  ProjectApiKey,
  SessionDetail,
  SessionSummary,
  SpanDetail,
  TraceDetail,
  TraceSummary,
} from "@lens/contracts";
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
  ChartTooltip,
  ChartTooltipContent,
} from "@lens/ui/components/chart";
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
  DropdownMenuContent,
  DropdownMenuItem,
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
import { ScrollArea } from "@lens/ui/components/scroll-area";
import { Separator } from "@lens/ui/components/separator";
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
  Stars as Sparkles,
  Sun,
  Programming as TerminalSquare,
  TrashBin2 as Trash2,
  UsersGroupRounded as Users,
  CloseCircle as X,
  Bolt as Zap,
} from "@solar-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
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
  useContext,
  useMemo,
  useState,
} from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useTheme } from "./components/theme-provider";
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

const ProjectContext = createContext<ProjectContextValue | null>(null);
const chartConfig = {
  traces: { label: "Traces", color: "var(--chart-2)" },
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

const traceColumns = traceColumnHelper.columns([
  traceColumnHelper.accessor("name", {
    header: sortableHeader("Trace"),
    cell: ({ row }) => <TraceNameCell trace={row.original} />,
  }),
  traceColumnHelper.accessor("serviceName", {
    header: sortableHeader("Service"),
  }),
  traceColumnHelper.accessor("status", {
    header: sortableHeader("Status"),
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  }),
  traceColumnHelper.accessor("durationMs", {
    header: sortableHeader("Duration"),
    cell: ({ row }) => <span className="font-mono">{formatDuration(row.original.durationMs)}</span>,
  }),
  traceColumnHelper.accessor("totalTokens", {
    header: sortableHeader("Tokens"),
    cell: ({ row }) => <span className="font-mono">{formatNumber(row.original.totalTokens)}</span>,
  }),
  traceColumnHelper.accessor("startedAt", {
    header: sortableHeader("Started"),
    cell: ({ row }) => relativeTime(row.original.startedAt),
  }),
  traceColumnHelper.display({
    id: "open",
    header: () => <span className="sr-only">Open</span>,
    cell: ({ row }) => <TraceOpenCell trace={row.original} />,
  }),
]);

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
    void navigate({ to: "/$projectId", params: { projectId: id } });
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
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center border-b bg-background px-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{project.name}</p>
      </div>
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
  const metrics = useQuery({
    queryKey: ["metrics", project.id],
    queryFn: () =>
      api<Metrics>(`/api/v1/projects/${project.id}/metrics?${queryString(timeRange(24))}`),
    refetchInterval: 5_000,
  });
  const value = metrics.data;
  return (
    <Page
      title="Overview"
      description="Agent traffic and performance during the last 24 hours"
      action={<LiveBadge />}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Traces" value={formatNumber(value?.traces)} icon={<Activity />} />
        <MetricCard
          label="Error rate"
          value={formatPercent(value?.errorRate)}
          icon={<AlertCircle />}
          destructive={Boolean(value?.errors)}
        />
        <MetricCard
          label="P95 latency"
          value={formatDuration(value?.durationP95Ms)}
          icon={<Clock3 />}
        />
        <MetricCard label="Total tokens" value={formatNumber(value?.totalTokens)} icon={<Zap />} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Trace volume</CardTitle>
            <CardDescription>Hourly telemetry accepted by this project</CardDescription>
          </CardHeader>
          <CardContent>
            {value?.series.length ? (
              <ChartContainer className="h-72 w-full" config={chartConfig}>
                <AreaChart data={value.series} margin={{ left: 0, right: 12 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(item) =>
                      new Date(item).toLocaleTimeString([], { hour: "2-digit" })
                    }
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    dataKey="traces"
                    type="monotone"
                    stroke="var(--color-traces)"
                    fill="var(--color-traces)"
                    fillOpacity={0.2}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            ) : (
              <EmptyState
                icon={<Sparkles />}
                title="Waiting for your first trace"
                text="Connect an OpenTelemetry exporter and activity will appear here."
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
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Usage</CardTitle>
            <CardDescription>Telemetry processed in this window</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <UsageRow label="Input tokens" value={formatNumber(value?.inputTokens)} />
            <Separator />
            <UsageRow label="Output tokens" value={formatNumber(value?.outputTokens)} />
            <Separator />
            <UsageRow label="Spans" value={formatNumber(value?.spans)} />
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}

export function TracesPage() {
  const { project } = useProject();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const range = timeRange(24);
  const traces = useQuery({
    queryKey: ["traces", project.id, search, status],
    queryFn: () =>
      api<CursorPage<TraceSummary>>(
        `/api/v1/projects/${project.id}/traces?${queryString({ ...range, search, status, limit: 100 })}`,
      ),
    refetchInterval: 5_000,
  });
  return (
    <Page
      title="Traces"
      description="Inspect agent runs, generations, tools, and service spans"
      action={<LiveBadge />}
    >
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute top-2 left-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-8"
                aria-label="Search traces"
                placeholder="Search name or trace ID"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <NativeSelect value={status} onChange={(event) => setStatus(event.target.value)}>
              <NativeSelectOption value="">All statuses</NativeSelectOption>
              <NativeSelectOption value="ok">Successful</NativeSelectOption>
              <NativeSelectOption value="error">Errors</NativeSelectOption>
              <NativeSelectOption value="unset">Unset</NativeSelectOption>
            </NativeSelect>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {traces.isLoading ? (
            <LoadingRows />
          ) : traces.data?.items.length ? (
            <TraceDataTable traces={traces.data.items} />
          ) : (
            <EmptyState
              icon={<Activity />}
              title="No traces found"
              text="Try another filter or send telemetry to this project."
            />
          )}
        </CardContent>
      </Card>
    </Page>
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

function TraceDataTable({ traces }: { traces: TraceSummary[] }) {
  const table = useTable({
    features: dataTableFeatures,
    columns: traceColumns,
    data: traces,
    getRowId: (trace) => trace.traceId,
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

export function SessionsPage() {
  const { project } = useProject();
  const [search, setSearch] = useState("");
  const range = timeRange(24);
  const sessions = useQuery({
    queryKey: ["sessions", project.id, search],
    queryFn: () =>
      api<{ items: SessionSummary[] }>(
        `/api/v1/projects/${project.id}/sessions?${queryString({ ...range, search, limit: 100 })}`,
      ),
    refetchInterval: 5_000,
  });
  return (
    <Page
      title="Sessions"
      description="Follow related traces across an end-to-end user interaction"
      action={<LiveBadge />}
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
  const trace = useQuery({
    queryKey: ["trace", project.id, traceId],
    queryFn: () => api<TraceDetail>(`/api/v1/projects/${project.id}/traces/${traceId}`),
    refetchInterval: 5_000,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detail = trace.data;
  const selected = detail?.spans.find((span) => span.spanId === selectedId) ?? detail?.spans[0];
  if (trace.isLoading)
    return <FullPageMessage icon={<Activity />} text="Loading trace" contained />;
  if (detail === undefined)
    return <FullPageMessage icon={<AlertCircle />} text="Trace not found" contained />;
  return (
    <Page
      title={detail.summary.name}
      description={`${detail.summary.serviceName} · ${detail.summary.traceId}`}
      action={
        <Link
          className={buttonVariants({ variant: "outline" })}
          to="/$projectId/traces"
          params={{ projectId: project.id }}
        >
          <ArrowLeft /> Back
        </Link>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Status">
          <StatusBadge status={detail.summary.status} />
        </SummaryCard>
        <SummaryCard label="Duration">{formatDuration(detail.summary.durationMs)}</SummaryCard>
        <SummaryCard label="Spans">{detail.summary.spanCount}</SummaryCard>
        <SummaryCard label="Tokens">{formatNumber(detail.summary.totalTokens)}</SummaryCard>
        <SummaryCard label="Session">
          {detail.summary.sessionId ? (
            <Link
              className="font-mono hover:underline"
              to="/$projectId/sessions/$sessionId"
              params={{ projectId: project.id, sessionId: detail.summary.sessionId }}
            >
              {detail.summary.sessionId}
            </Link>
          ) : (
            "—"
          )}
        </SummaryCard>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Observations</CardTitle>
            <CardDescription>Nested spans and relative execution time</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-96">
              <SpanTree
                spans={detail.spans}
                traceStart={detail.summary.startedAt}
                traceDuration={detail.summary.durationMs}
                selectedId={selected?.spanId}
                onSelect={setSelectedId}
              />
            </ScrollArea>
          </CardContent>
        </Card>
        <Card>{selected ? <SpanInspector span={selected} /> : null}</Card>
      </div>
    </Page>
  );
}

function SpanTree(props: {
  spans: SpanDetail[];
  traceStart: string;
  traceDuration: number;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const children = useMemo(() => {
    const map = new Map<string | null, SpanDetail[]>();
    const ids = new Set(props.spans.map((span) => span.spanId));
    for (const span of props.spans) {
      const parent = span.parentSpanId && ids.has(span.parentSpanId) ? span.parentSpanId : null;
      map.set(parent, [...(map.get(parent) ?? []), span]);
    }
    return map;
  }, [props.spans]);
  const render = (parent: string | null, depth: number): ReactNode =>
    (children.get(parent) ?? []).map((span) => {
      const startMs = Number(BigInt(span.startTimeUnixNano) / 1_000_000n);
      const traceStartMs = Date.parse(props.traceStart);
      const left = props.traceDuration ? ((startMs - traceStartMs) / props.traceDuration) * 100 : 0;
      const width = props.traceDuration
        ? (Number(BigInt(span.durationNano)) / 1_000_000 / props.traceDuration) * 100
        : 100;
      return (
        <div key={span.spanId}>
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted",
              props.selectedId === span.spanId && "bg-muted",
            )}
            onClick={() => props.onSelect(span.spanId)}
          >
            <span
              className="flex min-w-0 flex-1 items-center gap-2"
              style={{ paddingInlineStart: depth * 16 }}
            >
              <ObservationIcon kind={span.observationKind} />
              <span className="grid min-w-0">
                <span className="truncate text-sm font-medium">{span.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {span.observationKind} · {span.serviceName}
                </span>
              </span>
            </span>
            <span className="relative hidden h-2 flex-1 rounded-full bg-muted-foreground/20 md:block">
              <span
                className="absolute h-full rounded-full bg-primary"
                style={{
                  left: `${Math.max(0, left)}%`,
                  width: `${Math.max(1.5, Math.min(100, width))}%`,
                }}
              />
            </span>
            <span className="w-20 text-right font-mono text-xs text-muted-foreground">
              {formatDuration(Number(BigInt(span.durationNano)) / 1_000_000)}
            </span>
          </button>
          {render(span.spanId, depth + 1)}
        </div>
      );
    });
  return <div className="grid gap-1">{render(null, 0)}</div>;
}

function SpanInspector({ span }: { span: SpanDetail }) {
  const [tab, setTab] = useState<"input" | "output" | "attributes" | "events" | "raw">("input");
  const value =
    tab === "input"
      ? span.input
      : tab === "output"
        ? span.output
        : tab === "attributes"
          ? { resource: span.resourceAttributes, span: span.spanAttributes }
          : tab === "events"
            ? span.events
            : span;
  return (
    <>
      <CardHeader className="border-b">
        <div className="flex items-center gap-3">
          <ObservationIcon kind={span.observationKind} />
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate">{span.name}</CardTitle>
            <CardDescription>
              {span.observationKind} · {span.scopeName || "unscoped"}
            </CardDescription>
          </div>
          <StatusBadge status={span.status} />
        </div>
      </CardHeader>
      <CardContent className="pt-1">
        <Tabs value={tab} onValueChange={(item) => setTab(item as typeof tab)}>
          <TabsList variant="line" className="w-full overflow-x-auto">
            {(["input", "output", "attributes", "events", "raw"] as const).map((item) => (
              <TabsTrigger key={item} value={item}>
                {item}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value={tab} className="pt-3">
            <ScrollArea className="h-72 rounded-lg bg-muted p-3">
              <JsonView value={value} />
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock3 className="size-3" />{" "}
          {formatDuration(Number(BigInt(span.durationNano)) / 1_000_000)}
        </span>
        <span className="flex items-center gap-1">
          <Braces className="size-3" /> {shortId(span.spanId)}
        </span>
        {span.model ? (
          <span className="flex items-center gap-1">
            <Sparkles className="size-3" /> {span.model}
          </span>
        ) : null}
      </CardFooter>
    </>
  );
}

function JsonView({ value }: { value: unknown }) {
  if (value === null || value === undefined)
    return <span className="text-sm text-muted-foreground">No data captured</span>;
  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
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

function MetricCard(props: {
  label: string;
  value: string;
  icon: ReactNode;
  destructive?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{props.label}</CardDescription>
        <CardAction>
          <span
            className={cn(
              "flex size-8 items-center justify-center rounded-lg bg-muted",
              props.destructive && "text-destructive",
            )}
          >
            {props.icon}
          </span>
        </CardAction>
        <CardTitle className="text-2xl tabular-nums">{props.value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function UsageRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-mono text-lg font-medium">{value}</span>
    </div>
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
function LiveBadge() {
  const queryClient = useQueryClient();
  const [interval, setInterval] = useState("5s");

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
        Live · {interval}
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
          {["5s", "10s", "30s", "Off"].map((value) => (
            <DropdownMenuItem key={value} onClick={() => setInterval(value)}>
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
function formatNumber(value?: number) {
  return value === undefined
    ? "—"
    : new Intl.NumberFormat("en", { notation: value > 99_999 ? "compact" : "standard" }).format(
        value,
      );
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
function shortId(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
function relativeTime(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1_000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3_600)}h ago`;
}
function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
