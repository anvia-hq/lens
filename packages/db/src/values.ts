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
