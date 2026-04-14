/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** SoundCloud developer app Client ID (OAuth 2.1 + PKCE). Preferred over Meta for login/settings when set. */
  readonly VITE_SOUNDCLOUD_CLIENT_ID?: string;
  /** Override authorize URL (default https://secure.soundcloud.com/authorize). */
  readonly VITE_SOUNDCLOUD_AUTHORIZE_URL?: string;
  readonly VITE_META_APP_ID?: string;
  readonly VITE_META_LOGIN_APP_ID?: string;
  readonly VITE_META_PAGES_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
