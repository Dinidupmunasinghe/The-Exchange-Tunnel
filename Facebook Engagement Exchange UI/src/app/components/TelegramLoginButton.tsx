import { Link } from "react-router";
import { cn } from "./ui/utils";
import { TelegramBrandIcon } from "./TelegramBrandIcon";

type Props = {
  to?: string;
  label?: string;
  className?: string;
  onClick?: () => void;
  type?: "button" | "link";
  disabled?: boolean;
};

export function TelegramLoginButton({
  to = "/login/telegram",
  label = "Continue with Telegram",
  className,
  onClick,
  type = "link",
  disabled,
}: Props) {
  const styles = cn(
    "flex w-full items-center justify-center gap-3 rounded-lg border border-[#229ED9]/35 bg-[#2AABEE]/10 px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-colors",
    "hover:border-[#229ED9]/55 hover:bg-[#2AABEE]/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2AABEE]/50",
    disabled && "pointer-events-none opacity-50",
    className
  );

  const content = (
    <>
      <TelegramBrandIcon size={24} />
      <span>{label}</span>
    </>
  );

  if (type === "button") {
    return (
      <button type="button" className={styles} onClick={onClick} disabled={disabled}>
        {content}
      </button>
    );
  }

  return (
    <Link to={to} className={styles} onClick={onClick}>
      {content}
    </Link>
  );
}
