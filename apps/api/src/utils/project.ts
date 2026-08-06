export function parseRetentionDays(value: string): 7 | 30 | 90 | null {
  if (value === "7") return 7;
  if (value === "90") return 90;
  if (value === "unlimited") return null;
  return 30;
}
