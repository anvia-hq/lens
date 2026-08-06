import type { Project } from "@lens/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { api } from "../../../lib/api";

export function useProjectSetup() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");

  const setProjectName = (value: string) => {
    setName(value);
    setSlug(slugify(value));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await api<Project>("/api/v1/projects", {
        method: "POST",
        body: JSON.stringify({ name, slug }),
      });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Setup failed");
    }
  };

  return { error, name, setProjectName, setSlug, slug, submit };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
