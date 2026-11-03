import { ApiError } from "../services/api";
import type { SetupStepId } from "./setupStatus";

/**
 * Turns technical API errors into plain language and, when the fix is a setup step,
 * says which step to open. Used by toasts and the "finish setup" dialog.
 */
export type FriendlyError = { message: string; fixStep?: SetupStepId };

const RULES: { test: RegExp; message: string; fixStep?: SetupStepId }[] = [
  {
    test: /user session|mtproto|session auth|reconnect telegram user session|session appears expired/i,
    message: "Please verify your phone first — it lets us do the Telegram actions you choose.",
    fixStep: "phone",
  },
  {
    test: /connect your (telegram )?channel|connect a channel|target repost channel|connected channel/i,
    message: "Connect your Telegram channel first.",
    fixStep: "channel",
  },
  {
    test: /bot must be added|must be an admin|not an admin of your connected/i,
    message:
      "Our bot needs to be an admin of your channel, and you need to be an admin too. Add the bot as admin, then try again.",
    fixStep: "channel",
  },
  {
    test: /log in with telegram|telegram account not linked|connect your telegram account first/i,
    message: "Connect your Telegram account first.",
    fixStep: "telegram",
  },
  {
    test: /public channel username/i,
    message:
      "Subscriber campaigns need a public channel (with an @username). Set a username for your channel in Telegram, then try again.",
  },
  {
    test: /phone_code_expired|otp expired|code has expired/i,
    message: "That code expired. Tap “Send a new code” and enter the newest one.",
  },
  {
    test: /different telegram account than the one linked|session_account_mismatch/i,
    message:
      "That phone number belongs to a different Telegram account. Use the phone number of the Telegram account you connected.",
  },
  { test: /flood|too many telegram requests|rate limit/i, message: "Telegram asked us to slow down. Please wait a minute and try again." },
  { test: /bridge timed out|bridge/i, message: "Telegram is taking too long to respond. Please try again." },
  { test: /daily earning limit/i, message: "You reached today’s earning limit. Come back tomorrow for more." },
];

export function friendlyError(err: unknown, fallback = "Something went wrong. Please try again."): FriendlyError {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const code = err instanceof ApiError ? err.code || "" : "";
  const haystack = `${code} ${raw}`;
  for (const r of RULES) {
    if (r.test.test(haystack)) return { message: r.message, fixStep: r.fixStep };
  }
  return { message: raw || fallback };
}
