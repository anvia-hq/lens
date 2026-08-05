import type {
  CursorPage,
  Metrics,
  Project,
  ProjectApiKey,
  SpanDetail,
  TraceDetail,
  TraceSummary,
} from "@lens/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useParams } from "@tanstack/react-router";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Braces,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Copy,
  Database,
  Gauge,
  KeyRound,
  Layers3,
  LogOut,
  Menu,
  Search,
  Settings,
  Sparkles,
  TerminalSquare,
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
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, queryString } from "./lib/api";
import { authClient } from "./lib/auth";

type ProjectWithRole = Project & { role: string };
type Workspace = { id: string; name: string; slug: string; role: string; createdAt: string };

type ProjectContextValue = {
  project: ProjectWithRole;
  projects: ProjectWithRole[];
  selectProject: (id: string) => void;
};

const ProjectContext = createContext<ProjectContextValue | null>(null);

function useProject(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (context === null) throw new Error("Project context is unavailable");
  return context;
}

export function AppRoot() {
  const session = authClient.useSession();
  if (session.isPending) return <FullPageMessage icon={<Activity />} text="Opening Lens" />;
  if (session.data === null) return <AuthPage />;
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
  if (projectsQuery.isError) {
    return <FullPageMessage icon={<AlertCircle />} text="Could not load your Lens workspace" />;
  }
  if (project === undefined) return <SetupPage />;

  const selectProject = (id: string) => {
    localStorage.setItem("lens-project", id);
    setSelectedId(id);
  };

  return (
    <ProjectContext.Provider value={{ project, projects, selectProject }}>
      <div className="app-shell">
        <Sidebar user={props.user} />
        <main className="app-main">
          <Topbar />
          <div className="page-stage">
            <Outlet />
          </div>
        </main>
      </div>
    </ProjectContext.Provider>
  );
}

function Sidebar(props: { user: { name: string; email: string } }) {
  const [open, setOpen] = useState(false);
  const links = [
    { to: "/" as const, label: "Overview", icon: Gauge },
    { to: "/traces" as const, label: "Traces", icon: Activity },
    { to: "/onboarding" as const, label: "Connect", icon: TerminalSquare },
    { to: "/settings" as const, label: "Settings", icon: Settings },
  ];
  return (
    <>
      <button className="mobile-menu" onClick={() => setOpen((value) => !value)} type="button">
        <Menu size={19} />
      </button>
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">
            <CircleDot size={18} />
          </span>
          <span>lens</span>
          <span className="beta">beta</span>
        </div>
        <nav>
          {links.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="nav-link"
              activeProps={{ className: "nav-link active" }}
              onClick={() => setOpen(false)}
            >
              <Icon size={17} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="avatar">{props.user.name.slice(0, 1).toUpperCase()}</div>
          <div className="user-copy">
            <strong>{props.user.name}</strong>
            <span>{props.user.email}</span>
          </div>
          <button
            className="icon-button"
            type="button"
            title="Sign out"
            onClick={() => authClient.signOut()}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
    </>
  );
}

function Topbar() {
  const { project, projects, selectProject } = useProject();
  return (
    <header className="topbar">
      <div>
        <span className="eyebrow">Project</span>
        <strong>{project.name}</strong>
      </div>
      <select value={project.id} onChange={(event) => selectProject(event.target.value)}>
        {projects.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </header>
  );
}

export function OverviewPage() {
  const { project } = useProject();
  const range = timeRange(24);
  const metrics = useQuery({
    queryKey: ["metrics", project.id, range.from],
    queryFn: () => api<Metrics>(`/api/v1/projects/${project.id}/metrics?${queryString(range)}`),
    refetchInterval: 5_000,
  });
  const value = metrics.data;
  return (
    <Page
      title="Overview"
      description="Your agent traffic over the last 24 hours"
      action={<LiveBadge />}
    >
      <div className="metric-grid">
        <MetricCard label="Traces" value={formatNumber(value?.traces)} icon={<Activity />} />
        <MetricCard
          label="Error rate"
          value={formatPercent(value?.errorRate)}
          icon={<AlertCircle />}
          tone={value?.errors ? "bad" : undefined}
        />
        <MetricCard
          label="P95 latency"
          value={formatDuration(value?.durationP95Ms)}
          icon={<Clock3 />}
        />
        <MetricCard label="Total tokens" value={formatNumber(value?.totalTokens)} icon={<Zap />} />
      </div>
      <section className="panel chart-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Traffic</span>
            <h2>Trace volume</h2>
          </div>
          <span className="muted">Hourly</span>
        </div>
        {value?.series.length ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={value.series} margin={{ top: 20, right: 12, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="traceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a3ff12" stopOpacity={0.34} />
                  <stop offset="100%" stopColor="#a3ff12" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="timestamp"
                tickFormatter={(v) => new Date(v).toLocaleTimeString([], { hour: "2-digit" })}
                stroke="#71717a"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#71717a"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#18181b",
                  border: "1px solid #3f3f46",
                  borderRadius: 10,
                }}
              />
              <Area
                type="monotone"
                dataKey="traces"
                stroke="#a3ff12"
                fill="url(#traceFill)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            icon={<Sparkles />}
            title="Waiting for your first trace"
            text="Connect an OpenTelemetry exporter and activity will appear here."
            action={
              <Link className="button primary" to="/onboarding">
                Connect an app
              </Link>
            }
          />
        )}
      </section>
      <div className="split-grid">
        <section className="panel compact-stat">
          <span>Input tokens</span>
          <strong>{formatNumber(value?.inputTokens)}</strong>
        </section>
        <section className="panel compact-stat">
          <span>Output tokens</span>
          <strong>{formatNumber(value?.outputTokens)}</strong>
        </section>
        <section className="panel compact-stat">
          <span>Spans</span>
          <strong>{formatNumber(value?.spans)}</strong>
        </section>
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
      description="Inspect every agent run, generation, tool call, and service span"
      action={<LiveBadge />}
    >
      <section className="panel trace-list-panel">
        <div className="filters">
          <label className="search-box">
            <Search size={16} />
            <input
              placeholder="Search name or trace ID"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            <option value="ok">Successful</option>
            <option value="error">Errors</option>
            <option value="unset">Unset</option>
          </select>
          <span className="muted">Last 24 hours</span>
        </div>
        <div className="trace-table">
          <div className="trace-row trace-head">
            <span>Trace</span>
            <span>Service</span>
            <span>Status</span>
            <span>Duration</span>
            <span>Tokens</span>
            <span>Started</span>
            <span />
          </div>
          {traces.data?.items.map((trace) => (
            <TraceRow key={trace.traceId} trace={trace} />
          ))}
        </div>
        {!traces.isLoading && traces.data?.items.length === 0 ? (
          <EmptyState
            icon={<Activity />}
            title="No traces found"
            text="Try another filter or send telemetry to this project."
          />
        ) : null}
        {traces.isLoading ? <LoadingRows /> : null}
      </section>
    </Page>
  );
}

function TraceRow({ trace }: { trace: TraceSummary }) {
  return (
    <Link to="/traces/$traceId" params={{ traceId: trace.traceId }} className="trace-row">
      <span className="trace-name">
        <ObservationIcon kind={trace.generationCount > 0 ? "generation" : "span"} />
        <span>
          <strong>{trace.name}</strong>
          <small>
            {shortId(trace.traceId)} · {trace.spanCount} spans
          </small>
        </span>
      </span>
      <span>{trace.serviceName}</span>
      <span>
        <StatusBadge status={trace.status} />
      </span>
      <span className="mono">{formatDuration(trace.durationMs)}</span>
      <span className="mono">{formatNumber(trace.totalTokens)}</span>
      <span>{relativeTime(trace.startedAt)}</span>
      <ChevronRight size={16} />
    </Link>
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
        <Link className="button ghost" to="/traces">
          <ArrowLeft size={15} /> Back
        </Link>
      }
    >
      <div className="trace-summary-strip">
        <SummaryItem label="Status">
          <StatusBadge status={detail.summary.status} />
        </SummaryItem>
        <SummaryItem label="Duration">{formatDuration(detail.summary.durationMs)}</SummaryItem>
        <SummaryItem label="Spans">{detail.summary.spanCount}</SummaryItem>
        <SummaryItem label="Tokens">{formatNumber(detail.summary.totalTokens)}</SummaryItem>
        <SummaryItem label="Session">{detail.summary.sessionId ?? "—"}</SummaryItem>
      </div>
      <div className="trace-detail-grid">
        <section className="panel span-tree-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Timeline</span>
              <h2>Observations</h2>
            </div>
          </div>
          <SpanTree
            spans={detail.spans}
            traceStart={detail.summary.startedAt}
            traceDuration={detail.summary.durationMs}
            selectedId={selected?.spanId}
            onSelect={setSelectedId}
          />
        </section>
        <section className="panel inspector">
          {selected ? <SpanInspector span={selected} /> : null}
        </section>
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
            className={`span-row ${props.selectedId === span.spanId ? "selected" : ""}`}
            onClick={() => props.onSelect(span.spanId)}
          >
            <span className="span-label" style={{ paddingLeft: depth * 18 }}>
              <ObservationIcon kind={span.observationKind} />
              <span>
                <strong>{span.name}</strong>
                <small>{span.serviceName}</small>
              </span>
            </span>
            <span className="waterfall">
              <i
                style={{
                  left: `${Math.max(0, left)}%`,
                  width: `${Math.max(1.5, Math.min(100, width))}%`,
                }}
                data-kind={span.observationKind}
              />
            </span>
            <span className="mono">
              {formatDuration(Number(BigInt(span.durationNano)) / 1_000_000)}
            </span>
          </button>
          {render(span.spanId, depth + 1)}
        </div>
      );
    });
  return <div className="span-tree">{render(null, 0)}</div>;
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
      <div className="inspector-head">
        <div className="trace-name">
          <ObservationIcon kind={span.observationKind} />
          <span>
            <strong>{span.name}</strong>
            <small>{span.scopeName || "unscoped"}</small>
          </span>
        </div>
        <StatusBadge status={span.status} />
      </div>
      <div className="tab-list">
        {(["input", "output", "attributes", "events", "raw"] as const).map((item) => (
          <button
            type="button"
            className={tab === item ? "active" : ""}
            onClick={() => setTab(item)}
            key={item}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="json-view">
        <JsonView value={value} />
      </div>
      <div className="inspector-meta">
        <span>
          <Clock3 size={13} /> {formatDuration(Number(BigInt(span.durationNano)) / 1_000_000)}
        </span>
        <span>
          <Braces size={13} /> {shortId(span.spanId)}
        </span>
        {span.model ? (
          <span>
            <Sparkles size={13} /> {span.model}
          </span>
        ) : null}
      </div>
    </>
  );
}

function JsonView({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="muted">No data captured</span>;
  return <pre>{JSON.stringify(value, null, 2)}</pre>;
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
    setTimeout(() => setCopied(null), 1500);
  };
  return (
    <Page title="Connect an application" description={`Send OTLP/HTTP traces to ${project.name}`}>
      <div className="connect-grid">
        <section className="panel steps">
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
        </section>
        <div className="code-stack">
          <CodeBlock
            title="Environment"
            code={snippets.environment}
            copied={copied === "env"}
            onCopy={() => copy("env", snippets.environment)}
          />
          <CodeBlock
            title="Anvia + OpenTelemetry"
            code={snippets.anvía}
            copied={copied === "anvia"}
            onCopy={() => copy("anvia", snippets.anvía)}
          />
        </div>
      </div>
    </Page>
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });
  return (
    <Page title="Project settings" description="Control access and telemetry data handling">
      <div className="settings-grid">
        <section className="panel settings-card">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Access</span>
              <h2>Ingestion keys</h2>
            </div>
            <KeyRound size={19} />
          </div>
          <p className="muted">
            Keys authorize OTLP writes to this project. They cannot read trace data.
          </p>
          <div className="inline-form">
            <input value={keyName} onChange={(event) => setKeyName(event.target.value)} />
            <button
              className="button primary"
              type="button"
              onClick={() => createKey.mutate()}
              disabled={createKey.isPending}
            >
              Create key
            </button>
          </div>
          {newKey ? <SecretReveal value={newKey} onClose={() => setNewKey(null)} /> : null}
          <div className="key-list">
            {keys.data?.items.map((key) => (
              <div key={key.id}>
                <span>
                  <strong>{key.name}</strong>
                  <small>lens_ingest_{key.prefix}_••••••••</small>
                </span>
                <StatusBadge status={key.revokedAt ? "error" : "ok"} />
              </div>
            ))}
          </div>
        </section>
        <section className="panel settings-card">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Storage</span>
              <h2>Retention</h2>
            </div>
            <Database size={19} />
          </div>
          <p className="muted">Changes are applied asynchronously to existing and future traces.</p>
          <select value={retention} onChange={(event) => setRetention(event.target.value)}>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="unlimited">Unlimited</option>
          </select>
        </section>
        <section className="panel settings-card wide">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Privacy</span>
              <h2>Attribute redaction</h2>
            </div>
            <Braces size={19} />
          </div>
          <p className="muted">
            One case-insensitive attribute glob per line. Values are replaced before queueing and
            cannot be recovered.
          </p>
          <textarea
            rows={7}
            value={patterns}
            onChange={(event) => setPatterns(event.target.value)}
            placeholder="metadata.secret\nanvia.run.prompt"
          />
          <button
            className="button primary align-end"
            type="button"
            onClick={() => saveSettings.mutate()}
            disabled={saveSettings.isPending}
          >
            {saveSettings.isSuccess ? (
              <>
                <Check size={15} /> Saved
              </>
            ) : (
              "Save data settings"
            )}
          </button>
        </section>
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
  const submit = async (event: FormEvent) => {
    event.preventDefault();
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
  };
  return (
    <div className="auth-layout">
      <div className="auth-art">
        <div className="brand large">
          <span className="brand-mark">
            <CircleDot />
          </span>{" "}
          lens
        </div>
        <h1>Telemetry that speaks agent.</h1>
        <p>See every reasoning step, model call, tool execution, and failure in one trace.</p>
        <div className="art-grid" />
      </div>
      <div className="auth-card">
        <span className="eyebrow">
          {step === "workspace" ? "First workspace" : "First project"}
        </span>
        <h2>{step === "workspace" ? "Name your workspace" : "Create a project"}</h2>
        <p className="muted">
          {step === "workspace"
            ? "Workspaces group people and projects."
            : "Projects isolate ingestion keys and trace data."}
        </p>
        <form onSubmit={submit} className="form-stack">
          <label>
            Name
            <input
              required
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setSlug(slugify(event.target.value));
              }}
              placeholder={step === "workspace" ? "Acme AI" : "Production agents"}
            />
          </label>
          <label>
            Slug
            <input
              required
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="production-agents"
            />
          </label>
          <button className="button primary" type="submit">
            Continue <ChevronRight size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}

function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const result =
      mode === "signup"
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password });
    if (result.error) setError(result.error.message ?? "Authentication failed");
  };
  return (
    <div className="auth-layout">
      <div className="auth-art">
        <div className="brand large">
          <span className="brand-mark">
            <CircleDot />
          </span>{" "}
          lens
        </div>
        <h1>Telemetry that speaks agent.</h1>
        <p>See every reasoning step, model call, tool execution, and failure in one trace.</p>
        <div className="signal-lines">
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>
      <div className="auth-card">
        <span className="eyebrow">Welcome to Lens</span>
        <h2>{mode === "login" ? "Sign in to continue" : "Create your account"}</h2>
        <p className="muted">OpenTelemetry-native observability for AI systems.</p>
        <form onSubmit={submit} className="form-stack">
          {mode === "signup" ? (
            <label>
              Name
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
              />
            </label>
          ) : null}
          <label>
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              required
              minLength={8}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </label>
          {error ? (
            <div className="form-error">
              <AlertCircle size={15} />
              {error}
            </div>
          ) : null}
          <button className="button primary" type="submit">
            {mode === "login" ? "Sign in" : "Create account"}
            <ChevronRight size={16} />
          </button>
        </form>
        <button
          className="text-button"
          type="button"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
        >
          {mode === "login" ? "Need an account? Create one" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}

function Page(props: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Observability</span>
          <h1>{props.title}</h1>
          <p>{props.description}</p>
        </div>
        {props.action}
      </header>
      {props.children}
    </div>
  );
}
function MetricCard(props: { label: string; value: string; icon: ReactNode; tone?: "bad" }) {
  return (
    <section className={`metric-card ${props.tone ?? ""}`}>
      <div>
        <span>{props.label}</span>
        {props.icon}
      </div>
      <strong>{props.value}</strong>
      <small>Last 24 hours</small>
    </section>
  );
}
function SummaryItem(props: { label: string; children: ReactNode }) {
  return (
    <div>
      <span>{props.label}</span>
      <strong>{props.children}</strong>
    </div>
  );
}
function LiveBadge() {
  return (
    <span className="live-badge">
      <i /> Live · 5s
    </span>
  );
}
function StatusBadge({ status }: { status: "ok" | "error" | "unset" }) {
  return (
    <span className={`status-badge ${status}`}>
      <i />
      {status === "ok" ? "Success" : status === "error" ? "Error" : "Unset"}
    </span>
  );
}
function ObservationIcon({ kind }: { kind: SpanDetail["observationKind"] }) {
  const Icon =
    kind === "generation" ? Sparkles : kind === "tool" ? Zap : kind === "agent" ? Users : Layers3;
  return (
    <span className={`observation-icon ${kind}`}>
      <Icon size={14} />
    </span>
  );
}
function Step(props: { number: string; title: string; text: string }) {
  return (
    <div className="step">
      <span>{props.number}</span>
      <div>
        <h3>{props.title}</h3>
        <p>{props.text}</p>
      </div>
    </div>
  );
}
function CodeBlock(props: { title: string; code: string; copied: boolean; onCopy: () => void }) {
  return (
    <section className="code-block">
      <header>
        <span>{props.title}</span>
        <button type="button" onClick={props.onCopy}>
          {props.copied ? <Check size={14} /> : <Copy size={14} />}
          {props.copied ? "Copied" : "Copy"}
        </button>
      </header>
      <pre>{props.code}</pre>
    </section>
  );
}
function SecretReveal(props: { value: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="secret-reveal">
      <div>
        <AlertCircle size={15} />
        <span>Copy this key now. It will not be shown again.</span>
        <button type="button" onClick={props.onClose}>
          <X size={14} />
        </button>
      </div>
      <code>{props.value}</code>
      <button
        className="button ghost"
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(props.value);
          setCopied(true);
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? "Copied" : "Copy key"}
      </button>
    </div>
  );
}
function EmptyState(props: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span>{props.icon}</span>
      <h3>{props.title}</h3>
      <p>{props.text}</p>
      {props.action}
    </div>
  );
}
function FullPageMessage(props: { icon: ReactNode; text: string; contained?: boolean }) {
  return (
    <div className={props.contained ? "contained-message" : "full-message"}>
      <span>{props.icon}</span>
      <p>{props.text}</p>
    </div>
  );
}
function LoadingRows() {
  return (
    <div className="loading-rows">
      {[1, 2, 3, 4].map((item) => (
        <i key={item} />
      ))}
    </div>
  );
}
function timeRange(hours: number) {
  return {
    from: new Date(Date.now() - hours * 3_600_000).toISOString(),
    to: new Date().toISOString(),
  };
}
function formatNumber(value?: number) {
  return new Intl.NumberFormat(undefined, {
    notation: value && value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value ?? 0);
}
function formatPercent(value?: number) {
  return `${((value ?? 0) * 100).toFixed(1)}%`;
}
function formatDuration(value?: number) {
  if (value === undefined) return "0 ms";
  return value >= 1_000
    ? `${(value / 1_000).toFixed(2)} s`
    : `${value.toFixed(value < 10 ? 1 : 0)} ms`;
}
function shortId(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}
function relativeTime(value: string) {
  const seconds = Math.max(0, (Date.now() - Date.parse(value)) / 1_000);
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
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
