export function isGzipEncoding(value: string | undefined): boolean {
  return value?.toLowerCase() === "gzip";
}
