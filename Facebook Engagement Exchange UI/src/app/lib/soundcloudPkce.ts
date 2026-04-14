/** RFC 7636 PKCE for SoundCloud OAuth 2.1 (S256). */

const VERIFIER_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

function randomCodeVerifier(length = 64): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += VERIFIER_CHARSET[bytes[i] % VERIFIER_CHARSET.length];
  }
  return out;
}

function base64UrlEncode(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  let bin = "";
  u8.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256S256Challenge(codeVerifier: string): Promise<string> {
  const data = new TextEncoder().encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

export type SoundCloudPkceSessionKeys = {
  /** e.g. login_oauth_provider / settings_oauth_provider */
  providerKey: string;
  stateKey: string;
  verifierKey: string;
};

export async function buildSoundCloudAuthorizeUrl(opts: {
  clientId: string;
  redirectPath: string;
  authorizeBaseUrl?: string;
  session: SoundCloudPkceSessionKeys;
}): Promise<string> {
  const authorizeBase =
    opts.authorizeBaseUrl?.replace(/\/$/, "") || "https://secure.soundcloud.com/authorize";
  const verifier = randomCodeVerifier(64);
  const challenge = await sha256S256Challenge(verifier);
  const state = crypto.randomUUID();
  sessionStorage.setItem(opts.session.providerKey, "soundcloud");
  sessionStorage.setItem(opts.session.stateKey, state);
  sessionStorage.setItem(opts.session.verifierKey, verifier);
  const redirectUri = `${window.location.origin}${opts.redirectPath}`;
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });
  return `${authorizeBase}?${params.toString()}`;
}
