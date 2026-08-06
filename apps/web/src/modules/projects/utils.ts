import { toast } from "@lens/ui/components/toast";

export function notify(title: string, type: "success" | "error" | "info" = "success") {
  toast.add({ title, type, priority: type === "error" ? "high" : "low" });
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
