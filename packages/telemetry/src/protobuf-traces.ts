import { decodeKeyValue, decodeResource, decodeScope } from "./protobuf-common.js";
import {
  expectWire,
  flagsValue,
  hex,
  ProtobufReader,
  safeUnsignedNumber,
  unixNano,
} from "./protobuf-reader.js";
import type {
  OtlpEvent,
  OtlpExportRequest,
  OtlpLink,
  OtlpResourceSpans,
  OtlpScopeSpans,
  OtlpSpan,
} from "./types.js";

function decodeEvent(reader: ProtobufReader): OtlpEvent {
  const event: OtlpEvent = {
    timeUnixNano: "0",
    name: "",
    attributes: [],
    droppedAttributesCount: 0,
  };
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1) event.timeUnixNano = unixNano(reader, wire, "Span.Event.time_unix_nano");
    else if (field === 2) {
      expectWire(wire, 2, "Span.Event.name");
      event.name = reader.string();
    } else if (field === 3) {
      expectWire(wire, 2, "Span.Event.attributes");
      event.attributes.push(reader.message(decodeKeyValue));
    } else if (field === 4) {
      expectWire(wire, 0, "Span.Event.dropped_attributes_count");
      event.droppedAttributesCount = safeUnsignedNumber(
        reader.varint(),
        "Span.Event.dropped_attributes_count",
      );
    } else reader.skip(wire);
  }
  return event;
}

function decodeLink(reader: ProtobufReader): OtlpLink {
  const link: OtlpLink = {
    traceId: "",
    spanId: "",
    traceState: "",
    attributes: [],
    droppedAttributesCount: 0,
    flags: 0,
  };
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1) {
      expectWire(wire, 2, "Span.Link.trace_id");
      link.traceId = hex(reader.data());
    } else if (field === 2) {
      expectWire(wire, 2, "Span.Link.span_id");
      link.spanId = hex(reader.data());
    } else if (field === 3) {
      expectWire(wire, 2, "Span.Link.trace_state");
      link.traceState = reader.string();
    } else if (field === 4) {
      expectWire(wire, 2, "Span.Link.attributes");
      link.attributes.push(reader.message(decodeKeyValue));
    } else if (field === 5) {
      expectWire(wire, 0, "Span.Link.dropped_attributes_count");
      link.droppedAttributesCount = safeUnsignedNumber(
        reader.varint(),
        "Span.Link.dropped_attributes_count",
      );
    } else if (field === 6) link.flags = flagsValue(reader, wire, "Span.Link.flags");
    else reader.skip(wire);
  }
  return link;
}

function decodeStatus(reader: ProtobufReader): OtlpSpan["status"] {
  const status = { code: 0, message: "" };
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 2) {
      expectWire(wire, 2, "Status.message");
      status.message = reader.string();
    } else if (field === 3) {
      expectWire(wire, 0, "Status.code");
      status.code = safeUnsignedNumber(reader.varint(), "Status.code");
    } else reader.skip(wire);
  }
  return status;
}

function decodeSpan(reader: ProtobufReader): OtlpSpan {
  const span: OtlpSpan = {
    traceId: "",
    spanId: "",
    parentSpanId: "",
    traceState: "",
    flags: 0,
    name: "",
    kind: 0,
    startTimeUnixNano: "0",
    endTimeUnixNano: "0",
    attributes: [],
    events: [],
    links: [],
    status: { code: 0, message: "" },
  };
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1) {
      expectWire(wire, 2, "Span.trace_id");
      span.traceId = hex(reader.data());
    } else if (field === 2) {
      expectWire(wire, 2, "Span.span_id");
      span.spanId = hex(reader.data());
    } else if (field === 3) {
      expectWire(wire, 2, "Span.trace_state");
      span.traceState = reader.string();
    } else if (field === 4) {
      expectWire(wire, 2, "Span.parent_span_id");
      span.parentSpanId = hex(reader.data());
    } else if (field === 5) {
      expectWire(wire, 2, "Span.name");
      span.name = reader.string();
    } else if (field === 6) {
      expectWire(wire, 0, "Span.kind");
      span.kind = safeUnsignedNumber(reader.varint(), "Span.kind");
    } else if (field === 7) {
      span.startTimeUnixNano = unixNano(reader, wire, "Span.start_time_unix_nano");
    } else if (field === 8) {
      span.endTimeUnixNano = unixNano(reader, wire, "Span.end_time_unix_nano");
    } else if (field === 9) {
      expectWire(wire, 2, "Span.attributes");
      span.attributes.push(reader.message(decodeKeyValue));
    } else if (field === 11) {
      expectWire(wire, 2, "Span.events");
      span.events.push(reader.message(decodeEvent));
    } else if (field === 13) {
      expectWire(wire, 2, "Span.links");
      span.links.push(reader.message(decodeLink));
    } else if (field === 15) {
      expectWire(wire, 2, "Span.status");
      span.status = reader.message(decodeStatus);
    } else if (field === 16) span.flags = flagsValue(reader, wire, "Span.flags");
    else reader.skip(wire);
  }
  return span;
}

function decodeScopeSpans(reader: ProtobufReader): OtlpScopeSpans {
  const scopeSpans: OtlpScopeSpans = {
    scope: { name: "", version: "", attributes: [] },
    spans: [],
    schemaUrl: "",
  };
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1) {
      expectWire(wire, 2, "ScopeSpans.scope");
      scopeSpans.scope = reader.message(decodeScope);
    } else if (field === 2) {
      expectWire(wire, 2, "ScopeSpans.spans");
      scopeSpans.spans.push(reader.message(decodeSpan));
    } else if (field === 3) {
      expectWire(wire, 2, "ScopeSpans.schema_url");
      scopeSpans.schemaUrl = reader.string();
    } else reader.skip(wire);
  }
  return scopeSpans;
}

function decodeResourceSpans(reader: ProtobufReader): OtlpResourceSpans {
  const resourceSpans: OtlpResourceSpans = {
    resource: { attributes: [] },
    scopeSpans: [],
    schemaUrl: "",
  };
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1) {
      expectWire(wire, 2, "ResourceSpans.resource");
      resourceSpans.resource = reader.message(decodeResource);
    } else if (field === 2) {
      expectWire(wire, 2, "ResourceSpans.scope_spans");
      resourceSpans.scopeSpans.push(reader.message(decodeScopeSpans));
    } else if (field === 3) {
      expectWire(wire, 2, "ResourceSpans.schema_url");
      resourceSpans.schemaUrl = reader.string();
    } else reader.skip(wire);
  }
  return resourceSpans;
}

export function decodeProtobufRequest(bytes: Uint8Array): OtlpExportRequest {
  const request: OtlpExportRequest = { resourceSpans: [] };
  const reader = new ProtobufReader(bytes);
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1) {
      expectWire(wire, 2, "ExportTraceServiceRequest.resource_spans");
      request.resourceSpans.push(reader.message(decodeResourceSpans));
    } else reader.skip(wire);
  }
  return request;
}
