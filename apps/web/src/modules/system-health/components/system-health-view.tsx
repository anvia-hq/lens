import type { SystemCapacity, SystemHealth, SystemHealthStatus } from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";
import { Button } from "@lens/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@lens/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lens/ui/components/table";
import { cn } from "@lens/ui/lib/utils";
import {
  Pulse as Activity,
  WarningCircle as AlertCircle,
  Cpu,
  HardDrives as HardDrive,
  Hourglass,
  Stack as Layers3,
  Memory,
  ArrowClockwise as RefreshCw,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { ErrorAlert } from "../../../components/error-alert";
import { Page } from "../../../components/page";
import { SemanticStatusBadge } from "../../../components/semantic-status-badge";
import type { SystemHealthState } from "../hooks/use-system-health";

export function SystemHealthView({ state }: { state: SystemHealthState }) {
  if (!state.canManage) {
    return (
      <Page
        className="mx-auto max-w-7xl"
        title="System Health"
        description="Machine and service capacity for this Lens installation"
      >
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <AlertCircle className="size-5" /> Owner or admin access is required.
          </CardContent>
        </Card>
      </Page>
    );
  }

  const value = state.value;
  return (
    <Page
      className="mx-auto max-w-7xl"
      title="System Health"
      description="Current machine capacity, storage, services, workers, and queues"
      action={
        <div className="flex items-center gap-3">
          {value ? <StatusBadge status={value.overall} /> : null}
          <Button
            variant="outline"
            size="sm"
            disabled={state.health.isFetching}
            onClick={() => void state.health.refetch()}
          >
            <RefreshCw className={cn(state.health.isFetching && "animate-spin")} /> Refresh
          </Button>
        </div>
      }
    >
      {state.health.isError ? <ErrorAlert error={state.health.error} /> : null}
      {!value && state.health.isLoading ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Activity className="size-5 animate-pulse" /> Checking system health…
          </CardContent>
        </Card>
      ) : value ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{overallMessage(value)}</span>
            <span>Updated {new Date(value.sampledAt).toLocaleTimeString()}</span>
          </div>
          <MachineSection machine={value.machine} />
          <ServicesSection value={value} />
          <QueuesSection value={value} />
        </>
      ) : null}
    </Page>
  );
}

function MachineSection({ machine }: { machine: SystemHealth["machine"] }) {
  const snapshot = machine.snapshot;
  const disks = snapshot ? (snapshot.disks ?? [snapshot.disk]) : [];
  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">Machine resources</h2>
          <p className="text-sm text-muted-foreground">Live values from the Linux host collector</p>
        </div>
        <StatusBadge status={machine.status} />
      </div>
      {snapshot ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {[
            <ResourceCard
              key="cpu"
              icon={<Cpu />}
              label="CPU"
              percent={snapshot.cpu.usagePercent}
              value={
                snapshot.cpu.usagePercent === null
                  ? "Sampling…"
                  : `${formatPercent(snapshot.cpu.usagePercent)}`
              }
              detail={`${snapshot.cpu.logicalCores} cores · load ${snapshot.cpu.load1.toFixed(2)}`}
              status={cpuStatus(snapshot.cpu.usagePercent)}
            />,
            <CapacityCard
              key="ram"
              icon={<Memory />}
              label="RAM"
              capacity={snapshot.memory}
              kind="memory"
            />,
            <CapacityCard
              key="swap"
              icon={<Layers3 />}
              label="Swap"
              capacity={snapshot.swap}
              kind="informational"
            />,
            ...disks.map((disk) => (
              <CapacityCard
                key={`${disk.name ?? "Disk"}:${disk.path}`}
                icon={<HardDrive />}
                label={disk.name ?? (disk.path === "/" ? "Root disk" : "Disk")}
                capacity={disk}
                detailSuffix={disk.path}
                kind="disk"
              />
            )),
            <ResourceCard
              key="uptime"
              icon={<Hourglass />}
              label="Uptime"
              percent={null}
              value={formatUptime(snapshot.uptimeSeconds)}
              detail={`Sampled ${new Date(snapshot.sampledAt).toLocaleTimeString()}`}
              status="healthy"
            />,
          ].map((card, index, cards) => (
            <div
              key={card.key}
              className={cn("h-full", machineResourceCardClass(index, cards.length))}
            >
              {card}
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <AlertCircle className="size-5" />
            {machine.message ?? "Machine metrics are unavailable"}
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function ServicesSection({ value }: { value: SystemHealth }) {
  const services = [
    { name: "API", detail: "This request", ...value.services.api },
    {
      name: "PostgreSQL",
      detail:
        value.services.postgres.databaseBytes === null
          ? "Database size unavailable"
          : `${formatBytes(value.services.postgres.databaseBytes)} database`,
      ...value.services.postgres,
    },
    {
      name: "ClickHouse",
      detail:
        value.services.clickhouse.databaseBytes === null
          ? "Database size unavailable"
          : `${formatBytes(value.services.clickhouse.databaseBytes)} Lens data`,
      ...value.services.clickhouse,
    },
    {
      name: "Redis",
      detail:
        value.services.redis.usedMemoryBytes === null
          ? "Memory unavailable"
          : value.services.redis.maxMemoryBytes === null
            ? `${formatBytes(value.services.redis.usedMemoryBytes)} used · no configured limit`
            : `${formatBytes(value.services.redis.usedMemoryBytes)} / ${formatBytes(value.services.redis.maxMemoryBytes)}`,
      ...value.services.redis,
    },
    {
      name: "Worker",
      detail: `${value.services.worker.activeInstances} active instance${value.services.worker.activeInstances === 1 ? "" : "s"}`,
      latencyMs: null,
      ...value.services.worker,
    },
  ];
  return (
    <section className="grid gap-4">
      <div>
        <h2 className="font-medium">Lens services</h2>
        <p className="text-sm text-muted-foreground">Dependencies and background processing</p>
      </div>
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Service</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Capacity</TableHead>
              <TableHead className="text-right">Latency</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.map((service) => (
              <TableRow key={service.name}>
                <TableCell className="font-medium">{service.name}</TableCell>
                <TableCell>
                  <StatusBadge status={service.status} />
                </TableCell>
                <TableCell>
                  <span className={cn(service.name === "ClickHouse" && "whitespace-nowrap")}>
                    {service.message ?? service.detail}
                    {service.name === "ClickHouse" && value.services.clickhouse.disks.length > 0 ? (
                      <span className="text-xs text-muted-foreground">
                        {" · "}
                        {value.services.clickhouse.disks
                          .map(
                            (disk) =>
                              `${disk.name}: ${formatBytes(disk.availableBytes)} free (${formatPercent(disk.usagePercent)} used)`,
                          )
                          .join(" · ")}
                      </span>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {service.latencyMs === null ? "—" : `${service.latencyMs.toFixed(1)} ms`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </section>
  );
}

function QueuesSection({ value }: { value: SystemHealth }) {
  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">Queues</h2>
          <p className="text-sm text-muted-foreground">Current BullMQ job counts</p>
        </div>
        <StatusBadge status={value.queueStatus.status} />
      </div>
      {value.queues.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            {value.queueStatus.message ?? "No queue metrics available"}
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Queue</TableHead>
                <TableHead className="text-right">Waiting</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead className="text-right">Delayed</TableHead>
                <TableHead className="text-right">Failed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {value.queues.map((queue) => (
                <TableRow key={queue.name}>
                  <TableCell className="font-medium">{queue.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{queue.waiting}</TableCell>
                  <TableCell className="text-right tabular-nums">{queue.active}</TableCell>
                  <TableCell className="text-right tabular-nums">{queue.delayed}</TableCell>
                  <TableCell className="text-right tabular-nums">{queue.failed}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </section>
  );
}

function machineResourceCardClass(index: number, count: number): string {
  const lastPairOnDesktop = count % 3 === 2 && index >= count - 2;
  const lastAloneOnDesktop = count % 3 === 1 && index === count - 1;
  const lastAloneOnTablet = count % 2 === 1 && index === count - 1;
  return cn(
    lastAloneOnTablet && "sm:col-span-2",
    lastPairOnDesktop
      ? "lg:col-span-3"
      : lastAloneOnDesktop
        ? "lg:col-span-2 lg:col-start-3"
        : "lg:col-span-2",
  );
}

function CapacityCard({
  capacity,
  detailSuffix,
  icon,
  kind,
  label,
}: {
  capacity: SystemCapacity;
  detailSuffix?: string;
  icon: ReactNode;
  kind: "disk" | "informational" | "memory";
  label: string;
}) {
  return (
    <ResourceCard
      icon={icon}
      label={label}
      percent={capacity.usagePercent}
      value={formatPercent(capacity.usagePercent)}
      detail={`${formatBytes(capacity.usedBytes)} / ${formatBytes(capacity.totalBytes)}${detailSuffix ? ` · ${detailSuffix}` : ""}`}
      status={
        kind === "disk"
          ? diskStatus(capacity.usagePercent)
          : kind === "memory"
            ? memoryStatus(capacity.usagePercent)
            : "healthy"
      }
    />
  );
}

function ResourceCard({
  detail,
  icon,
  label,
  percent,
  status,
  value,
}: {
  detail: string;
  icon: ReactNode;
  label: string;
  percent: number | null;
  status: SystemHealthStatus;
  value: string;
}) {
  return (
    <Card className="h-full">
      <CardHeader className="gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">{icon}</span>
          {status === "healthy" ? null : <StatusBadge status={status} compact />}
        </div>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="mt-auto grid gap-2">
        <div className="h-1.5">
          {percent === null ? null : (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-[width]",
                  status === "critical"
                    ? "bg-status-error"
                    : status === "warning"
                      ? "bg-status-warning"
                      : "bg-primary",
                )}
                style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
              />
            </div>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </CardContent>
    </Card>
  );
}

function StatusBadge({
  compact = false,
  status,
}: {
  compact?: boolean;
  status: SystemHealthStatus;
}) {
  if (status === "healthy" && !compact) {
    return <SemanticStatusBadge tone="success">Healthy</SemanticStatusBadge>;
  }
  return (
    <Badge
      variant="outline"
      className={cn(
        "capitalize",
        status === "healthy" && "border-status-success/40 text-status-success",
        status === "warning" && "border-status-warning/40 text-status-warning",
        status === "critical" && "border-status-error/40 text-status-error",
        (status === "unavailable" || status === "not_configured") && "text-muted-foreground",
      )}
    >
      {compact ? <span className="sr-only">{statusLabel(status)}</span> : statusLabel(status)}
      {compact ? (
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-full",
            status === "healthy"
              ? "bg-status-success"
              : status === "warning"
                ? "bg-status-warning"
                : status === "critical"
                  ? "bg-status-error"
                  : "bg-muted-foreground",
          )}
        />
      ) : null}
    </Badge>
  );
}

function statusLabel(status: SystemHealthStatus): string {
  if (status === "not_configured") return "Not configured";
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function overallMessage(value: SystemHealth): string {
  if (value.overall === "critical") return "Immediate attention is required.";
  if (value.overall === "warning") return "One or more resources need attention.";
  return "All monitored systems are operating normally.";
}

function cpuStatus(percent: number | null): SystemHealthStatus {
  if (percent === null) return "healthy";
  return percent >= 95 ? "critical" : percent >= 85 ? "warning" : "healthy";
}

function memoryStatus(percent: number): SystemHealthStatus {
  return percent >= 90 ? "critical" : percent >= 80 ? "warning" : "healthy";
}

function diskStatus(percent: number): SystemHealthStatus {
  return percent >= 90 ? "critical" : percent >= 80 ? "warning" : "healthy";
}

function formatPercent(value: number): string {
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function formatBytes(value: number): string {
  if (value <= 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  const amount = value / 1024 ** index;
  return `${amount.toFixed(amount >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((seconds % 3_600) / 60);
  return `${hours}h ${minutes}m`;
}
