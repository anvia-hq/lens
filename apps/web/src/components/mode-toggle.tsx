import { SidebarMenuButton } from "@lens/ui/components/sidebar";
import { Laptop, Moon, Sun } from "@phosphor-icons/react";
import { useTheme } from "../hooks/use-theme";

export function ModeToggle() {
  const { theme, setTheme } = useTheme();
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Laptop;
  const nextTheme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
  const label =
    theme === "system" ? "System theme" : `${theme[0]?.toUpperCase()}${theme.slice(1)} theme`;
  return (
    <SidebarMenuButton
      type="button"
      title={`${label}. Switch to ${nextTheme} theme`}
      aria-label={`${label}. Switch to ${nextTheme} theme`}
      onClick={() => setTheme(nextTheme)}
    >
      <Icon />
      <span>{label}</span>
    </SidebarMenuButton>
  );
}
