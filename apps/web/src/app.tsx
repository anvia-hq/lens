import type {
  CursorPage,
  Metrics,
  Project,
  ProjectApiKey,
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
  SidebarRail,
  SidebarTrigger,
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useParams, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Braces,
  Building2,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Copy,
  Database,
  Gauge,
  KeyRound,
  Laptop,
  Layers3,
  LogOut,
  MailPlus,
  Moon,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  TerminalSquare,
  Trash2,
  UserCog,
  Users,
  X,
  Zap,
} from "lucide-react";
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
type Workspace = { id: string; name: string; slug: string; role: string; createdAt: string };
type WorkspaceMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  createdAt: string;
  isCurrentUser: boolean;
};
type WorkspaceInvitation = {
  id: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
};
type WorkspaceDirectory = {
  role: string;
  canManage: boolean;
  members: WorkspaceMember[];
  invitations: WorkspaceInvitation[];
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
  if (session.isPending) return <FullPageMessage icon={<Activity />} text="Opening Lens" />;
  if (session.data === null) return <AuthPage />;
  if (window.location.pathname.startsWith("/accept-invitation/")) return <Outlet />;
  return <AuthenticatedApp user={session.data.user} />;
}

function AuthenticatedApp(props: { user: { name: string; email: string } }) {
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<{ items: ProjectWithRole[] }>("/api/v1/projects"),
  });
  const projects = projectsQuery.data?.items ?? [];
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem("lens-project") ?? "");
  const project = projects.find((item) => item.id === selectedId) ?? projects[0];

  if (projectsQuery.isLoading)
    return <FullPageMessage icon={<Activity />} text="Loading projects" />;
  if (projectsQuery.isError)
    return <FullPageMessage icon={<AlertCircle />} text="Could not load your Lens workspace" />;
  if (project === undefined) return <SetupPage />;

  const selectProject = (id: string) => {
    localStorage.setItem("lens-project", id);
    setSelectedId(id);
  };

  return (
    <ProjectContext.Provider value={{ project, projects, selectProject }}>
      <SidebarProvider>
        <AppSidebar user={props.user} />
        <SidebarInset>
          <AppHeader />
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
    </ProjectContext.Provider>
  );
}

function AppSidebar(props: { user: { name: string; email: string } }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const links = [
    { to: "/" as const, label: "Overview", icon: Gauge },
    { to: "/traces" as const, label: "Traces", icon: Activity },
    { to: "/onboarding" as const, label: "Connect", icon: TerminalSquare },
    { to: "/workspace" as const, label: "Workspace", icon: Building2 },
    { to: "/settings" as const, label: "Settings", icon: Settings },
  ];
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex h-10 items-center gap-2 px-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <CircleDot className="size-4" />
          </span>
          <div className="grid min-w-0 group-data-collapsible-icon:hidden">
            <span className="font-heading text-sm font-medium">Lens</span>
            <span className="truncate text-xs text-muted-foreground">OpenTelemetry</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Observability</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {links.map(({ to, label, icon: Icon }) => {
                const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
                return (
                  <SidebarMenuItem key={to}>
                    <SidebarMenuButton render={<Link to={to} />} isActive={active} tooltip={label}>
                      <Icon />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
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
      <SidebarRail />
    </Sidebar>
  );
}

function AppHeader() {
  const { project, projects, selectProject } = useProject();
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-5" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{project.name}</p>
        <p className="truncate text-xs text-muted-foreground">Current project</p>
      </div>
      <NativeSelect
        aria-label="Select project"
        value={project.id}
        onChange={(event) => selectProject(event.target.value)}
        className="hidden sm:block"
      >
        {projects.map((item) => (
          <NativeSelectOption key={item.id} value={item.id}>
            {item.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <ModeToggle />
    </header>
  );
}

function ModeToggle() {
  const { theme, setTheme } = useTheme();
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Laptop;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label="Choose color theme" />}
      >
        <Icon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun /> Light {theme === "light" ? <Check className="ml-auto" /> : null}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon /> Dark {theme === "dark" ? <Check className="ml-auto" /> : null}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Laptop /> System {theme === "system" ? <Check className="ml-auto" /> : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
            <CardAction>
              <Badge variant="outline">24 hours</Badge>
            </CardAction>
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
                  <Link className={buttonVariants()} to="/onboarding">
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
            <Badge variant="outline">Last 24 hours</Badge>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {traces.isLoading ? (
            <LoadingRows />
          ) : traces.data?.items.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trace</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Tokens</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>
                      <span className="sr-only">Open</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {traces.data.items.map((trace) => (
                    <TraceRow key={trace.traceId} trace={trace} />
                  ))}
                </TableBody>
              </Table>
            </div>
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

function TraceRow({ trace }: { trace: TraceSummary }) {
  return (
    <TableRow>
      <TableCell>
        <Link
          className="flex items-center gap-3 font-medium hover:underline"
          to="/traces/$traceId"
          params={{ traceId: trace.traceId }}
        >
          <ObservationIcon kind={trace.generationCount > 0 ? "generation" : "span"} />
          <span className="grid">
            <span>{trace.name}</span>
            <span className="font-mono text-xs font-normal text-muted-foreground">
              {shortId(trace.traceId)} · {trace.spanCount} spans
            </span>
          </span>
        </Link>
      </TableCell>
      <TableCell>{trace.serviceName}</TableCell>
      <TableCell>
        <StatusBadge status={trace.status} />
      </TableCell>
      <TableCell className="font-mono">{formatDuration(trace.durationMs)}</TableCell>
      <TableCell className="font-mono">{formatNumber(trace.totalTokens)}</TableCell>
      <TableCell>{relativeTime(trace.startedAt)}</TableCell>
      <TableCell>
        <Link
          className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
          to="/traces/$traceId"
          params={{ traceId: trace.traceId }}
          aria-label={`Open ${trace.name}`}
        >
          <ChevronRight />
        </Link>
      </TableCell>
    </TableRow>
  );
}

export function TraceDetailPage() {
  const { project } = useProject();
  const { traceId } = useParams({ from: "/traces/$traceId" });
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
        <Link className={buttonVariants({ variant: "outline" })} to="/traces">
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
        <SummaryCard label="Session">{detail.summary.sessionId ?? "—"}</SummaryCard>
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
                <span className="truncate text-xs text-muted-foreground">{span.serviceName}</span>
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
            <CardDescription>{span.scopeName || "unscoped"}</CardDescription>
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
  const endpoint = `${window.location.origin}/v1/traces`;
  const snippets = {
    environment: `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=${endpoint}\nOTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer <YOUR_INGESTION_KEY>`,
    anvía: `import { otel } from "@anvia/otel";\nimport { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";\nimport { NodeSDK } from "@opentelemetry/sdk-node";\n\nconst sdk = new NodeSDK({\n  traceExporter: new OTLPTraceExporter({\n    url: "${endpoint}",\n    headers: { Authorization: "Bearer <YOUR_INGESTION_KEY>" },\n  }),\n});\nsdk.start();\n\nconst tracing = otel.create({ serviceName: "my-agent" });`,
  };
  const copy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    notify("Copied to clipboard");
    setTimeout(() => setCopied(null), 1500);
  };
  return (
    <Page title="Connect an application" description={`Send OTLP/HTTP traces to ${project.name}`}>
      <div className="grid gap-4 lg:grid-cols-3">
        <Step
          number="01"
          title="Create an ingestion key"
          text="Generate a project-scoped key in Settings. The secret is shown once."
        />
        <Step
          number="02"
          title="Configure your exporter"
          text="Lens accepts OTLP JSON and protobuf over HTTP, including gzip."
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
          <TabsTrigger value="anvia">Anvia + OpenTelemetry</TabsTrigger>
        </TabsList>
        <TabsContent value="environment">
          <CodeBlock
            title="Environment"
            code={snippets.environment}
            copied={copied === "env"}
            onCopy={() => copy("env", snippets.environment)}
          />
        </TabsContent>
        <TabsContent value="anvia">
          <CodeBlock
            title="Anvia + OpenTelemetry"
            code={snippets.anvía}
            copied={copied === "anvia"}
            onCopy={() => copy("anvia", snippets.anvía)}
          />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

export function WorkspacePage() {
  const { project, projects, selectProject } = useProject();
  const queryClient = useQueryClient();
  const workspaces = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => api<{ items: Workspace[] }>("/api/v1/workspaces"),
  });
  const [workspaceId, setWorkspaceId] = useState(project.workspaceId);
  const selectedWorkspace =
    workspaces.data?.items.find((item) => item.id === workspaceId) ?? workspaces.data?.items[0];
  const directory = useQuery({
    queryKey: ["workspace-directory", selectedWorkspace?.id],
    queryFn: () => api<WorkspaceDirectory>(`/api/v1/workspaces/${selectedWorkspace?.id}/directory`),
    enabled: selectedWorkspace !== undefined,
  });
  const workspaceProjects = projects.filter((item) => item.workspaceId === selectedWorkspace?.id);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [workspaceDialog, setWorkspaceDialog] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectSlug, setProjectSlug] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [removeMemberId, setRemoveMemberId] = useState<string | null>(null);

  const invalidateDirectory = () =>
    queryClient.invalidateQueries({ queryKey: ["workspace-directory", selectedWorkspace?.id] });
  const createWorkspace = useMutation({
    mutationFn: () =>
      api<Workspace>("/api/v1/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: workspaceName, slug: workspaceSlug }),
      }),
    onSuccess: async (created) => {
      setWorkspaceName("");
      setWorkspaceSlug("");
      setWorkspaceId(created.id);
      setWorkspaceDialog(false);
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      notify("Workspace created");
    },
  });
  const createProject = useMutation({
    mutationFn: () =>
      api<Project>("/api/v1/projects", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: selectedWorkspace?.id,
          name: projectName,
          slug: projectSlug,
        }),
      }),
    onSuccess: async (created) => {
      setProjectName("");
      setProjectSlug("");
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      selectProject(created.id);
      notify("Project created");
    },
  });
  const deleteProject = useMutation({
    mutationFn: (projectId: string) =>
      api<void>(`/api/v1/projects/${projectId}`, { method: "DELETE" }),
    onSuccess: async (_, deletedId) => {
      setDeleteProjectId(null);
      const fallback = projects.find((item) => item.id !== deletedId && item.state === "active");
      if (project.id === deletedId && fallback) selectProject(fallback.id);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      notify("Project deletion queued");
    },
  });
  const inviteMember = useMutation({
    mutationFn: () =>
      api<WorkspaceInvitation>("/api/auth/organization/invite-member", {
        method: "POST",
        body: JSON.stringify({
          organizationId: selectedWorkspace?.id,
          email: inviteEmail,
          role: inviteRole,
        }),
      }),
    onSuccess: async () => {
      setInviteEmail("");
      await invalidateDirectory();
      notify("Invitation sent");
    },
  });
  const updateRole = useMutation({
    mutationFn: (input: { memberId: string; role: "admin" | "member" }) =>
      api<{ id: string; role: string }>(
        `/api/v1/workspaces/${selectedWorkspace?.id}/members/${input.memberId}`,
        { method: "PATCH", body: JSON.stringify({ role: input.role }) },
      ),
    onSuccess: async () => {
      await invalidateDirectory();
      notify("Member role updated");
    },
  });
  const removeMember = useMutation({
    mutationFn: (memberId: string) =>
      api<void>(`/api/v1/workspaces/${selectedWorkspace?.id}/members/${memberId}`, {
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
    createWorkspace.error ??
    createProject.error ??
    deleteProject.error ??
    inviteMember.error ??
    updateRole.error ??
    removeMember.error ??
    cancelInvitation.error;

  return (
    <Page
      title="Workspace"
      description="Manage workspace boundaries, projects, teammates, and access"
      action={
        <div className="flex gap-2">
          <NativeSelect
            value={selectedWorkspace?.id ?? ""}
            onChange={(event) => setWorkspaceId(event.target.value)}
          >
            {workspaces.data?.items.map((item) => (
              <NativeSelectOption key={item.id} value={item.id}>
                {item.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button onClick={() => setWorkspaceDialog(true)}>
            <Plus /> Workspace
          </Button>
        </div>
      }
    >
      {managementError ? <ErrorAlert error={managementError} /> : null}
      <Card>
        <CardHeader>
          <CardTitle>{selectedWorkspace?.name ?? "Workspace"}</CardTitle>
          <CardDescription>
            Workspaces are the access boundary for people and projects.
          </CardDescription>
          <CardAction>
            <Badge variant="secondary">
              <UserCog /> {directory.data?.role ?? selectedWorkspace?.role ?? "member"}
            </Badge>
          </CardAction>
        </CardHeader>
      </Card>
      <Tabs defaultValue="projects">
        <TabsList>
          <TabsTrigger value="projects">
            <Layers3 /> Projects
          </TabsTrigger>
          <TabsTrigger value="members">
            <Users /> Members
          </TabsTrigger>
        </TabsList>
        <TabsContent value="projects">
          <Card>
            <CardHeader>
              <CardTitle>Projects</CardTitle>
              <CardDescription>
                Telemetry, settings, and ingestion keys are isolated per project.
              </CardDescription>
            </CardHeader>
            {directory.data?.canManage ? (
              <CardContent>
                <form
                  className="grid gap-3 md:grid-cols-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    createProject.mutate();
                  }}
                >
                  <Input
                    required
                    placeholder="Project name"
                    value={projectName}
                    onChange={(event) => {
                      setProjectName(event.target.value);
                      setProjectSlug(slugify(event.target.value));
                    }}
                  />
                  <Input
                    required
                    placeholder="project-slug"
                    value={projectSlug}
                    onChange={(event) => setProjectSlug(event.target.value)}
                  />
                  <Button disabled={createProject.isPending} type="submit">
                    <Plus /> Create project
                  </Button>
                </form>
              </CardContent>
            ) : null}
            <CardContent className="grid gap-2">
              {workspaceProjects.map((item) => (
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
              {workspaceProjects.length === 0 ? (
                <EmptyState
                  icon={<Layers3 />}
                  title="No projects yet"
                  text="Create the first telemetry project in this workspace."
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
            </CardHeader>
            {directory.data?.canManage ? (
              <CardContent>
                <form
                  className="grid gap-3 md:grid-cols-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    inviteMember.mutate();
                  }}
                >
                  <Input
                    required
                    type="email"
                    placeholder="teammate@company.com"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                  />
                  <NativeSelect
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value as "admin" | "member")}
                    className="w-full"
                  >
                    <NativeSelectOption value="member">Member</NativeSelectOption>
                    <NativeSelectOption value="admin">Admin</NativeSelectOption>
                  </NativeSelect>
                  <Button disabled={inviteMember.isPending} type="submit">
                    <MailPlus /> Send invitation
                  </Button>
                </form>
              </CardContent>
            ) : null}
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

      <Dialog open={workspaceDialog} onOpenChange={setWorkspaceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
            <DialogDescription>
              Create a separate access boundary for a team or organization.
            </DialogDescription>
          </DialogHeader>
          <form
            id="workspace-form"
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              createWorkspace.mutate();
            }}
          >
            <Field>
              <FieldLabel htmlFor="workspace-name">Name</FieldLabel>
              <Input
                id="workspace-name"
                required
                value={workspaceName}
                onChange={(event) => {
                  setWorkspaceName(event.target.value);
                  setWorkspaceSlug(slugify(event.target.value));
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="workspace-slug">Slug</FieldLabel>
              <Input
                id="workspace-slug"
                required
                value={workspaceSlug}
                onChange={(event) => setWorkspaceSlug(event.target.value)}
              />
            </Field>
          </form>
          <DialogFooter showCloseButton>
            <Button form="workspace-form" type="submit" disabled={createWorkspace.isPending}>
              Create workspace
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
              They will immediately lose access to every project in this workspace.
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
      eyebrow="Workspace invitation"
      title={`Join ${detail.organizationName}`}
      description={
        <>
          You were invited as <strong>{detail.role ?? "member"}</strong>. Accept to access this
          workspace and its projects.
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
  const [newKey, setNewKey] = useState<string | null>(null);
  const [keyName, setKeyName] = useState("Development");
  const [retention, setRetention] = useState(
    project.settings.retentionDays === null ? "unlimited" : String(project.settings.retentionDays),
  );
  const [patterns, setPatterns] = useState(project.settings.redactionPatterns.join("\n"));
  const createKey = useMutation({
    mutationFn: () =>
      api<ProjectApiKey & { key: string }>(`/api/v1/projects/${project.id}/keys`, {
        method: "POST",
        body: JSON.stringify({ name: keyName }),
      }),
    onSuccess: (result) => {
      setNewKey(result.key);
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
            {newKey ? <SecretReveal value={newKey} onClose={() => setNewKey(null)} /> : null}
            <div className="grid gap-2">
              {keys.data?.items.map((key) => (
                <div className="flex items-center gap-3 rounded-lg border p-3" key={key.id}>
                  <span className="grid min-w-0 flex-1">
                    <span className="font-medium">{key.name}</span>
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      lens_ingest_{key.prefix}_••••••••
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
  const [step, setStep] = useState<"workspace" | "project">("workspace");
  const [workspaceId, setWorkspaceId] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      if (step === "workspace") {
        const workspace = await api<Workspace>("/api/v1/workspaces", {
          method: "POST",
          body: JSON.stringify({ name, slug }),
        });
        setWorkspaceId(workspace.id);
        setName("");
        setSlug("");
        setStep("project");
      } else {
        await api<Project>("/api/v1/projects", {
          method: "POST",
          body: JSON.stringify({ workspaceId, name, slug }),
        });
        await queryClient.invalidateQueries({ queryKey: ["projects"] });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Setup failed");
    }
  };
  return (
    <CenteredCard
      icon={<CircleDot />}
      eyebrow={step === "workspace" ? "First workspace" : "First project"}
      title={step === "workspace" ? "Create your workspace" : "Create a project"}
      description={
        step === "workspace"
          ? "Workspaces group people and projects."
          : "Projects isolate ingestion keys and trace data."
      }
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
            placeholder={step === "workspace" ? "Acme AI" : "Production agents"}
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
      eyebrow="Welcome to Lens"
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
          <span className="mx-auto flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
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
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col gap-6 p-4 md:p-6">
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
      <CardFooter className="text-xs text-muted-foreground">Last 24 hours</CardFooter>
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
  return (
    <Badge variant="outline">
      <span className="size-2 rounded-full bg-primary" /> Live · 5s
    </Badge>
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
    kind === "generation" ? Sparkles : kind === "tool" ? Zap : kind === "agent" ? Users : Layers3;
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

function SecretReveal(props: { value: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Alert>
      <AlertCircle />
      <AlertTitle>Copy this key now</AlertTitle>
      <AlertDescription className="grid gap-3">
        <span>It will not be shown again.</span>
        <code className="break-all rounded-lg bg-muted p-3 font-mono text-xs">{props.value}</code>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(props.value);
              setCopied(true);
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy key"}
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
