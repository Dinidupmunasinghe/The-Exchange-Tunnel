import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { cn } from "../ui/utils";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="group"
      aria-label="Toggle color theme"
      className={cn(
        "relative inline-flex h-9 items-center rounded-full border border-border bg-card p-1 dark:bg-card/90",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1 bottom-1 left-1 w-7 rounded-full shadow-sm transition-[transform,background-color] duration-200 ease-out",
          theme === "dark"
            ? "translate-x-0 bg-indigo-500/18 ring-1 ring-inset ring-indigo-400/25 dark:bg-indigo-500/22 dark:ring-indigo-400/35"
            : "translate-x-7 bg-amber-400/22 ring-1 ring-inset ring-amber-500/30 dark:bg-amber-400/18 dark:ring-amber-400/28",
        )}
      />
      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-pressed={theme === "dark"}
        aria-label="Use dark theme"
        className={cn(
          "relative z-10 flex h-7 w-7 items-center justify-center rounded-full transition-colors",
          theme === "dark"
            ? "text-indigo-600 dark:text-indigo-300"
            : "text-muted-foreground hover:text-indigo-500/80 dark:hover:text-indigo-400/70",
        )}
      >
        <Moon className="h-3.5 w-3.5" strokeWidth={2.25} />
      </button>
      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-pressed={theme === "light"}
        aria-label="Use light theme"
        className={cn(
          "relative z-10 flex h-7 w-7 items-center justify-center rounded-full transition-colors",
          theme === "light"
            ? "text-amber-600 dark:text-amber-400"
            : "text-muted-foreground hover:text-amber-500/85 dark:hover:text-amber-400/70",
        )}
      >
        <Sun className="h-3.5 w-3.5" strokeWidth={2.25} />
      </button>
    </div>
  );
}
