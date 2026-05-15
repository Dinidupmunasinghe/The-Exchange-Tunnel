import { useId } from "react";
import { cn } from "./ui/utils";

type Props = {
  className?: string;
  size?: number;
};

/** Official-style Telegram logo with brand gradient (colorful). */
export function TelegramBrandIcon({ className, size = 22 }: Props) {
  const gradId = useId().replace(/:/g, "");

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 240 240"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="120" y1="240" x2="120" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2AABEE" />
          <stop offset="1" stopColor="#229ED9" />
        </linearGradient>
      </defs>
      <circle cx="120" cy="120" r="120" fill={`url(#${gradId})`} />
      <path
        fill="#fff"
        d="M81.23 118.09l89.6-34.62c7.43-2.87 14.2 1.82 11.72 11.1l-15.2 65.9c-1.72 7.46-6.12 9.28-12.38 5.78l-34.2-25.2-16.5 15.9c-1.83 1.83-3.36 3.36-6.9 3.36l2.46-35.02 63.1-57.02c2.75-2.44-.6-3.78-4.26-1.35L73.1 130.86l-33.4-10.45c-7.26-2.27-7.38-7.26 1.53-10.32z"
      />
    </svg>
  );
}

/** White paper plane for use on solid Telegram-blue buttons. */
export function TelegramPlaneWhite({ className, size = 20 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <path
        fill="#fff"
        d="M9.04 11.77 18.9 7.27c.62-.3 1.19.15.98.93l-1.27 5.5c-.14.62-.51.77-1.04.48l-2.85-2.1-1.38 1.33c-.15.15-.28.28-.58.28l.2-2.92 5.26-4.75c.23-.2-.05-.32-.36-.15L8.12 12.2 2.34 10.5c-.6-.19-.61-.61.13-.87z"
      />
    </svg>
  );
}
