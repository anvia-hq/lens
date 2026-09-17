import { decodeAnyValue, decodeKeyValue, decodeResource, decodeScope } from "./protobuf-common.js";
import {
  expectWire,
  flagsValue,
  hex,
  ProtobufReader,
  safeUnsignedNumber,
  unixNano,
} from "./protobuf-reader.js";
import type { OtlpLogRecord, OtlpLogsExportRequest, OtlpResourceLogs } from "./types.js";

function decodeLogRecord(reader: ProtobufReader): OtlpLogRecord {
  const record: OtlpLogRecord = {
    timeUnixNano: "0",
    observedTimeUnixNano: "0",
    severityNumber: 0,
    severityText: "",
    body: null,
    attributes: [],
    droppedAttributesCount: 0,
    flags: 0,
    traceId: "",
    spanId: "",
    eventName: "",
  };
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1) {
      record.timeUnixNano = unixNano(reader, wire, "LogRecord.time_unix_nano");
    } else if (field === 2) {
      record.observedTimeUnixNano = unixNano(reader, wire, "LogRecord.observed_time_unix_nano");
    } else if (field === 3) {
      expectWire(wire, 0, "LogRecord.severity_number");
      record.severityNumber = safeUnsignedNumber(reader.varint(), "LogRecord.severity_number");
    } else if (field === 4) {
      expectWire(wire, 2, "LogRecord.severity_text");
      record.severityText = reader.string();
    } else if (field === 5) {
      expectWire(wire, 2, "LogRecord.body");
      record.body = reader.message(decodeAnyValue);
    } else if (field === 6) {
      expectWire(wire, 2, "LogRecord.attributes");
      record.attributes.push(reader.message(decodeKeyValue));
    } else if (field === 7) {
      expectWire(wire, 0, "LogRecord.dropped_attributes_count");
      record.droppedAttributesCount = safeUnsignedNumber(
        reader.varint(),
        "LogRecord.dropped_attributes_count",
      );
    } else if (field === 8) record.flags = flagsValue(reader, wire, "LogRecord.flags");
    else if (field === 9) {
      expectWire(wire, 2, "LogRecord.trace_id");
      record.traceId = hex(reader.data());
    } else if (field === 10) {
      expectWire(wire, 2, "LogRecord.span_id");
      record.spanId = hex(reader.data());
    } else if (field === 11) {
      expectWire(wire, 2, "LogRecord.event_name");
      record.eventName = reader.string();
    } else reader.skip(wire);
  }
  return record;
}

function decodeScopeLogs(reader: ProtobufReader): OtlpResourceLogs["scopeLogs"][number] {
  const scopeLogs: OtlpResourceLogs["scopeLogs"][number] = {
    scope: { name: "", version: "", attributes: [] },
    logRecords: [],
    schemaUrl: "",
  };
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1) {
      expectWire(wire, 2, "ScopeLogs.scope");
      scopeLogs.scope = reader.message(decodeScope);
    } else if (field === 2) {
      expectWire(wire, 2, "ScopeLogs.log_records");
      scopeLogs.logRecords.push(reader.message(decodeLogRecord));
    } else if (field === 3) {
      expectWire(wire, 2, "ScopeLogs.schema_url");
      scopeLogs.schemaUrl = reader.string();
    } else reader.skip(wire);
  }
  return scopeLogs;
}

function decodeResourceLogs(reader: ProtobufReader): OtlpResourceLogs {
  const resourceLogs: OtlpResourceLogs = {
    resource: { attributes: [] },
    scopeLogs: [],
    schemaUrl: "",
  };
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1) {
      expectWire(wire, 2, "ResourceLogs.resource");
      resourceLogs.resource = reader.message(decodeResource);
    } else if (field === 2) {
      expectWire(wire, 2, "ResourceLogs.scope_logs");
      resourceLogs.scopeLogs.push(reader.message(decodeScopeLogs));
    } else if (field === 3) {
      expectWire(wire, 2, "ResourceLogs.schema_url");
      resourceLogs.schemaUrl = reader.string();
    } else reader.skip(wire);
  }
  return resourceLogs;
}

export function decodeProtobufLogsRequest(bytes: Uint8Array): OtlpLogsExportRequest {
  const request: OtlpLogsExportRequest = { resourceLogs: [] };
  const reader = new ProtobufReader(bytes);
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1) {
      expectWire(wire, 2, "ExportLogsServiceRequest.resource_logs");
      request.resourceLogs.push(reader.message(decodeResourceLogs));
    } else reader.skip(wire);
  }
  return request;
}
