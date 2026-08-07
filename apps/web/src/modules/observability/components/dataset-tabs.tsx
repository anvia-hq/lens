import { Button } from "@lens/ui/components/button";
import type { EvaluationDatasetsState } from "../hooks/use-evaluation-datasets";

export function DatasetTabs({ state }: { state: EvaluationDatasetsState }) {
  const tab = state.search.tab ?? "managed";
  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant={tab === "managed" ? "default" : "outline"}
        onClick={() =>
          state.setSearch({
            tab: "managed",
            dataset: undefined,
            version: undefined,
          })
        }
      >
        Managed
      </Button>
      <Button
        size="sm"
        variant={tab === "observed" ? "default" : "outline"}
        onClick={() =>
          state.setSearch({
            tab: "observed",
            managedDataset: undefined,
            managedVersion: undefined,
          })
        }
      >
        Observed
      </Button>
    </div>
  );
}
