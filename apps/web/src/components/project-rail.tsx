import { Avatar, AvatarFallback } from "@lens/ui/components/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@lens/ui/components/tooltip";
import { cn } from "@lens/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { useProject } from "../modules/projects/hooks/use-project";

export function ProjectRail() {
  const { project, projects } = useProject();

  return (
    <aside
      aria-label="Projects"
      className="flex h-svh w-14 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
    >
      <nav className="no-scrollbar flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto p-2">
        {projects.map((item) => {
          const active = item.id === project.id;
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger
                render={
                  <Link
                    aria-current={active ? "page" : undefined}
                    aria-label={`Switch to ${item.name}`}
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg outline-hidden transition-colors hover:bg-sidebar-accent focus-visible:bg-sidebar-accent"
                    to="/$projectId"
                    params={{ projectId: item.id }}
                    search={{ range: "24h" }}
                  >
                    <Avatar className="size-8 rounded-md after:rounded-md">
                      <AvatarFallback
                        className={cn("rounded-md", active && "bg-primary text-primary-foreground")}
                      >
                        {item.name.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                }
              />
              <TooltipContent side="right" sideOffset={8}>
                {item.name}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    </aside>
  );
}
