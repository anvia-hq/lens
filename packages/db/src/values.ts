export function numeric(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function nullableNumeric(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function ensureIso(value: string): string {
  if (value.endsWith("Z")) return value;
  return `${value.replace(" ", "T")}Z`;
}

export function clickHouseDateTimeParam(value: string): string {
  const milliseconds = Date.parse(value);
  if (Number.isFinite(milliseconds)) {
    return new Date(milliseconds).toISOString().replace("T", " ").replace("Z", "");
  }
  return value.replace("T", " ").replace(/Z$/, "");
}

const ISO_UTC_NANO_PATTERN = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z?$/;

export function clickHouseDateTime9Param(value: string): string {
  const match = ISO_UTC_NANO_PATTERN.exec(value);
  if (match !== null) {
    const fraction = (match[3] ?? "").padEnd(9, "0");
    return `${match[1]} ${match[2]}.${fraction}`;
  }
  return clickHouseDateTimeParam(value);
}
