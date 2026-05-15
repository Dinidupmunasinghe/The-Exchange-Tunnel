import { useId } from "react";
import { cn } from "./ui/utils";

type Props = {
  className?: string;
  size?: number;
};

/** Official Telegram brand mark (gradient circle + plane). */
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
        <linearGradient id={gradId} x1="0.6667" y1="0.1667" x2="0.4167" y2="0.75" gradientUnits="objectBoundingBox">
          <stop stopColor="#37AEE2" />
          <stop offset="1" stopColor="#1E96C8" />
        </linearGradient>
      </defs>
      <circle cx="120" cy="120" r="120" fill={`url(#${gradId})`} />
      <path
        fill="#fff"
        d="M81.229 128.772l14.237-63.438c.546-2.386-2.438-1.121-3.746-.781l-55.874 17.726c-2.604.823-2.553 4.753.081 5.516l14.355 4.5 33.206 20.374c1.585.969 3.851-.036 4.337-1.848l4.78-18.905 33.204 24.517c2.23 1.639 5.391.127 6.078-2.568l12.606-59.49c.894-4.203-3.279-7.632-6.683-5.259l-113.869 69.72c-1.921 1.171-4.873.112-4.994-2.277z"
      />
    </svg>
  );
}
