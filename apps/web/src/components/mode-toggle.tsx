import { Button } from "@lens/ui/components/button";
import { SidebarMenuButton } from "@lens/ui/components/sidebar";
import { Laptop, Moon, Sun } from "@phosphor-icons/react";
import { useTheme } from "../hooks/use-theme";

export function ModeToggle({ standalone = false }: { standalone?: boolean }) {
  const { theme, setTheme } = useTheme();
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Laptop;
  const nextTheme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
  const label =
    theme === "system" ? "System theme" : `${theme[0]?.toUpperCase()}${theme.slice(1)} theme`;
  const toggleProps = {
    type: "button" as const,
    title: `${label}. Switch to ${nextTheme} theme`,
    "aria-label": `${label}. Switch to ${nextTheme} theme`,
    onClick: () => setTheme(nextTheme),
  };

  if (standalone) {
    return (
      <Button variant="ghost" size="icon" {...toggleProps}>
        <Icon />
      </Button>
    );
  }

  return (
    <SidebarMenuButton className="size-8 justify-center p-0" {...toggleProps}>
      <Icon />
    </SidebarMenuButton>
  );
}
