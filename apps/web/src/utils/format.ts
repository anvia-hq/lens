export function shortId(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
