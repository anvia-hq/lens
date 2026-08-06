import { createContext, useContext } from "react";
import type { ProjectContextValue } from "../types";

export const ProjectContext = createContext<ProjectContextValue | null>(null);

export function useProject(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (context === null) throw new Error("Project context is unavailable");
  return context;
}
