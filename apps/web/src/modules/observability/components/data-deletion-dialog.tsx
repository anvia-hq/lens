import type { DataDeletionEntityType } from "@lens/contracts";
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
import { Spinner } from "@lens/ui/components/spinner";
import { Trash } from "@phosphor-icons/react";

const labels: Record<DataDeletionEntityType, { singular: string; plural: string; detail: string }> =
  {
    trace: {
      singular: "trace",
      plural: "traces",
      detail: "Its spans and linked evaluation results will also be permanently removed.",
    },
    session: {
      singular: "session",
      plural: "sessions",
      detail:
        "Every trace in the session, its spans, and linked evaluation results will be removed.",
    },
    evaluation_run: {
      singular: "evaluation run",
      plural: "evaluation runs",
      detail:
        "The run and its evaluation results will be removed. Referenced traces are preserved.",
    },
  };

export function DataDeletionDialog(props: {
  entityType: DataDeletionEntityType;
  ids: string[];
  pending: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const label = labels[props.entityType];
  const count = props.ids.length;
  return (
    <AlertDialog open={count > 0} onOpenChange={props.onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {count === 1 ? `this ${label.singular}` : `${count} ${label.plural}`}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {label.detail} This cannot be undone. New telemetry using the same IDs may recreate the
            data later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={props.pending}
            onClick={(event) => {
              event.preventDefault();
              props.onConfirm();
            }}
          >
            {props.pending ? <Spinner /> : <Trash />} Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
