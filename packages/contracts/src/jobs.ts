import type { ZodType } from "zod";
import {
  type DispatchAlertJob,
  dispatchAlertJobSchema,
  type EvaluateAlertsJob,
  evaluateAlertsJobSchema,
} from "./alerts.js";
import { type DeleteDataJob, deleteDataJobSchema } from "./data-deletions.js";
import { type IngestEvaluationsJob, ingestEvaluationsJobSchema } from "./evaluations.js";
import {
  type DeleteProjectTelemetryJob,
  deleteProjectTelemetryJobSchema,
  type RecalculateModelCostsJob,
  type ReconcileRetentionJob,
  recalculateModelCostsJobSchema,
  reconcileRetentionJobSchema,
} from "./projects.js";
import {
  type IngestTraceJob,
  ingestTraceJobSchema,
  type MaterializeTraceJob,
  materializeTraceJobSchema,
} from "./telemetry.js";

export const queueJobNames = {
  ingest: "ingest",
  evaluations: "ingest",
  materialize: "materialize",
  maintenance: {
    reconcileRetention: "reconcile-retention",
    deleteProject: "delete-project",
    deleteData: "delete-data",
  },
  costs: "recalculate-model-costs",
  alerts: "evaluate-alert-rules",
  dispatch: "dispatch-alert",
} as const;

export type QueueJobMap = {
  ingest: { ingest: IngestTraceJob };
  evaluations: { ingest: IngestEvaluationsJob };
  materialize: { materialize: MaterializeTraceJob };
  maintenance: {
    "reconcile-retention": ReconcileRetentionJob;
    "delete-project": DeleteProjectTelemetryJob;
    "delete-data": DeleteDataJob;
  };
  costs: { "recalculate-model-costs": RecalculateModelCostsJob };
  alerts: { "evaluate-alert-rules": EvaluateAlertsJob };
  dispatch: { "dispatch-alert": DispatchAlertJob };
};

type QueueJobSchemaMap = {
  [QueueKey in keyof QueueJobMap]: {
    [Name in keyof QueueJobMap[QueueKey]]: ZodType<unknown>;
  };
};

export const queueJobSchemas = {
  ingest: { ingest: ingestTraceJobSchema },
  evaluations: { ingest: ingestEvaluationsJobSchema },
  materialize: { materialize: materializeTraceJobSchema },
  maintenance: {
    "reconcile-retention": reconcileRetentionJobSchema,
    "delete-project": deleteProjectTelemetryJobSchema,
    "delete-data": deleteDataJobSchema,
  },
  costs: { "recalculate-model-costs": recalculateModelCostsJobSchema },
  alerts: { "evaluate-alert-rules": evaluateAlertsJobSchema },
  dispatch: { "dispatch-alert": dispatchAlertJobSchema },
} satisfies QueueJobSchemaMap;
