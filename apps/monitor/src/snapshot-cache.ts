import type { SystemMonitorSnapshot } from "@lens/contracts";

type SnapshotSource = {
  snapshot: () => Promise<SystemMonitorSnapshot>;
};

export class SnapshotCache {
  private current: SystemMonitorSnapshot | undefined;
  private collectionError: unknown;
  private collecting: Promise<void> | undefined;

  constructor(private readonly source: SnapshotSource) {}

  collect(): Promise<void> {
    if (this.collecting !== undefined) return this.collecting;
    this.collecting = this.source
      .snapshot()
      .then((snapshot) => {
        this.current = snapshot;
        this.collectionError = undefined;
      })
      .catch((error: unknown) => {
        this.current = undefined;
        this.collectionError = error;
      })
      .finally(() => {
        this.collecting = undefined;
      });
    return this.collecting;
  }

  latest(): SystemMonitorSnapshot | undefined {
    return this.current;
  }

  error(): unknown {
    return this.collectionError;
  }
}
