import { cn } from "./ui/utils";
import telegramIcon from "../../assets/telegram-icon.png";

type Props = {
  className?: string;
  size?: number;
};

/** Official Telegram logo (brand asset). */
export function TelegramBrandIcon({ className, size = 22 }: Props) {
  return (
    <img
      src={telegramIcon}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className={cn("shrink-0 object-contain", className)}
      aria-hidden
    />
  );
}
