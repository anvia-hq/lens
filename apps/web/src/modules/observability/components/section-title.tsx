export function SectionTitle({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
