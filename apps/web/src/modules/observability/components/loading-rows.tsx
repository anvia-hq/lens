import { Skeleton } from "@lens/ui/components/skeleton";

export function LoadingRows() {
  return (
    <div className="grid gap-2 p-4">
      {[1, 2, 3, 4].map((item) => (
        <Skeleton className="h-14 w-full" key={item} />
      ))}
    </div>
  );
}
