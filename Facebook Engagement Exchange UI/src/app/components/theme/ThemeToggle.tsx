import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="group"
      aria-label="Toggle color theme"
      className={`relative inline-flex h-9 items-center rounded-full border border-border bg-card p-1 ${className}`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-1 bottom-1 left-1 w-7 rounded-full bg-secondary shadow-sm transition-transform duration-200 ease-out ${
          theme === "dark" ? "translate-x-0" : "translate-x-7"
        }`}
      />
      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-pressed={theme === "dark"}
        aria-label="Use dark theme"
        className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
          theme === "dark" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Moon className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-pressed={theme === "light"}
        aria-label="Use light theme"
        className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
          theme === "light" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Sun className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
