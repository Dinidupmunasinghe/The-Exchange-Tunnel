/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** Your Telegram bot username, without @ — used for the official Login widget */
  readonly VITE_TELEGRAM_BOT_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
