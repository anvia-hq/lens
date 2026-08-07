import { decodeJsonLogsRequest, decodeJsonRequest } from "./json.js";

import {
  decodeProtobufLogsRequest,
  decodeProtobufRequest,
  encodeProtobufLogsResponse,
  encodeProtobufResponse,
} from "./protobuf.js";

import type { OtlpExportRequest, OtlpLogsExportRequest } from "./types.js";

export type OtlpContentType = "application/json" | "application/x-protobuf";

export function parseOtlpContentType(value: string | undefined): OtlpContentType | undefined {
  const contentType = value?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType === "application/json" || contentType === "application/x-protobuf") {
    return contentType;
  }
  return undefined;
}

export function decodeOtlpRequest(
  bytes: Uint8Array,
  contentType: OtlpContentType,
): OtlpExportRequest {
  return contentType === "application/json"
    ? decodeJsonRequest(bytes)
    : decodeProtobufRequest(bytes);
}

export function decodeOtlpLogsRequest(
  bytes: Uint8Array,
  contentType: OtlpContentType,
): OtlpLogsExportRequest {
  return contentType === "application/json"
    ? decodeJsonLogsRequest(bytes)
    : decodeProtobufLogsRequest(bytes);
}

export function encodeOtlpResponse(
  contentType: OtlpContentType,
  rejectedSpans = 0,
  errorMessage = "",
): Uint8Array {
  if (contentType === "application/x-protobuf") {
    return encodeProtobufResponse(rejectedSpans, errorMessage);
  }
  const response =
    rejectedSpans === 0 && errorMessage.length === 0
      ? {}
      : { partialSuccess: { rejectedSpans: String(rejectedSpans), errorMessage } };
  return new TextEncoder().encode(JSON.stringify(response));
}

export function encodeOtlpLogsResponse(
  contentType: OtlpContentType,
  rejectedLogRecords = 0,
  errorMessage = "",
): Uint8Array {
  if (contentType === "application/x-protobuf") {
    return encodeProtobufLogsResponse(rejectedLogRecords, errorMessage);
  }
  const response =
    rejectedLogRecords === 0 && errorMessage.length === 0
      ? {}
      : { partialSuccess: { rejectedLogRecords: String(rejectedLogRecords), errorMessage } };
  return new TextEncoder().encode(JSON.stringify(response));
}
