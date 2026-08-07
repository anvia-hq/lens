export function TableTimestamp({ value }: { value: string }) {
  return (
    <span className="whitespace-nowrap text-xs" title={value}>
      {formatTableTimestamp(value)}
    </span>
  );
}

export function formatTableTimestamp(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : value;
}
