import { Skeleton } from "@lens/ui/components/skeleton";

export function OverviewSkeleton() {
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
