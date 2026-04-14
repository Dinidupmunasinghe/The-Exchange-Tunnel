const axios = require("axios");
const env = require("../config/env");

const API_BASE = (env.soundcloud && env.soundcloud.apiBase) || "https://api.soundcloud.com";
const TOKEN_URL = (env.soundcloud && env.soundcloud.tokenUrl) || "https://secure.soundcloud.com/oauth/token";

function bearerHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json; charset=utf-8"
  };
}

function isConfigured() {
  return Boolean(env.soundcloud?.clientId && env.soundcloud?.clientSecret);
}

/**
 * OAuth 2.1 authorization code exchange (requires PKCE code_verifier).
 * @see https://developers.soundcloud.com/docs/api/guide#authentication
 */
async function exchangeAuthorizationCode({ code, redirectUri, codeVerifier }) {
  if (!isConfigured()) {
    throw new Error("SoundCloud API credentials are not configured on the server");
  }
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: env.soundcloud.clientId,
    client_secret: env.soundcloud.clientSecret,
    redirect_uri: redirectUri,
    code_verifier: String(codeVerifier),
    code: String(code)
  });
  try {
    const { data } = await axios.post(TOKEN_URL, body.toString(), {
      headers: {
        Accept: "application/json; charset=utf-8",
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });
    if (!data?.access_token) {
      throw new Error("SoundCloud did not return an access token");
    }
    return data;
  } catch (err) {
    const msg =
      err.response?.data?.error_description ||
      err.response?.data?.error ||
      err.response?.data?.message ||
      err.message ||
      "SoundCloud token exchange failed";
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
}

async function fetchAuthenticatedUser(accessToken) {
  const { data } = await axios.get(`${API_BASE}/me`, {
    headers: bearerHeaders(accessToken)
  });
  return data;
}

/**
 * Resolve a public track URL to a numeric track id (handles 302 from /resolve).
 */
async function resolveTrackUrl(accessToken, trackUrl) {
  const trimmed = String(trackUrl || "").trim();
  const direct = trimmed.match(/soundcloud\.com\/tracks\/(\d+)/i);
  if (direct) return direct[1];

  try {
    const { data } = await axios.get(`${API_BASE}/resolve`, {
      params: { url: trimmed },
      headers: bearerHeaders(accessToken),
      maxRedirects: 15
    });
    if (data && data.id != null) {
      return String(data.id);
    }
  } catch (err) {
    const loc = err.response?.headers?.location || err.response?.request?.path;
    if (loc) {
      const m = String(loc).match(/\/tracks\/(\d+)/);
      if (m) return m[1];
    }
  }
  return null;
}

async function listMyTracks(accessToken, { limit = 50 } = {}) {
  const { data } = await axios.get(`${API_BASE}/me/tracks`, {
    headers: bearerHeaders(accessToken),
    params: { limit, linked_partitioning: true }
  });
  const collection = Array.isArray(data)
    ? data
    : data?.collection || data?.tracks || (Array.isArray(data?.data) ? data.data : []) || [];
  return collection.map((t) => ({
    id: String(t.id),
    message: typeof t.title === "string" ? t.title : "",
    createdTime: t.created_at || t.display_date || null,
    permalinkUrl: typeof t.permalink_url === "string" ? t.permalink_url : `https://soundcloud.com/${t.permalink || ""}`,
    previewImageUrl: t.artwork_url || t.artwork_url_large || null,
    statusType: t.sharing === "private" ? "private" : "public"
  }));
}

async function likeTrack(accessToken, trackId) {
  const id = encodeURIComponent(String(trackId).trim());
  const { data } = await axios.post(`${API_BASE}/likes/tracks/${id}`, null, {
    headers: bearerHeaders(accessToken)
  });
  return data;
}

async function unlikeTrack(accessToken, trackId) {
  const id = encodeURIComponent(String(trackId).trim());
  await axios.delete(`${API_BASE}/likes/tracks/${id}`, {
    headers: bearerHeaders(accessToken)
  });
  return true;
}

async function commentOnTrack(accessToken, trackId, bodyText) {
  const id = encodeURIComponent(String(trackId).trim());
  const { data } = await axios.post(
    `${API_BASE}/tracks/${id}/comments`,
    { comment: { body: String(bodyText).trim() } },
    {
      headers: {
        ...bearerHeaders(accessToken),
        "Content-Type": "application/json"
      }
    }
  );
  return data;
}

async function deleteTrackComment(accessToken, trackId, commentId) {
  const tid = encodeURIComponent(String(trackId).trim());
  const cid = encodeURIComponent(String(commentId).trim());
  await axios.delete(`${API_BASE}/tracks/${tid}/comments/${cid}`, {
    headers: bearerHeaders(accessToken)
  });
  return true;
}

/** Repost (maps to "share" engagement). */
async function repostTrack(accessToken, trackId) {
  const id = encodeURIComponent(String(trackId).trim());
  const { data, status } = await axios.post(`${API_BASE}/reposts/tracks/${id}`, null, {
    headers: bearerHeaders(accessToken),
    validateStatus: () => true
  });
  if (status >= 400) {
    const msg =
      data?.errors?.[0]?.error_message ||
      data?.error?.message ||
      data?.message ||
      `SoundCloud repost failed (${status})`;
    throw new Error(typeof msg === "string" ? msg : "SoundCloud repost failed");
  }
  if (status === 204 || data == null) {
    return { track_id: String(trackId) };
  }
  return data;
}

async function deleteTrackRepost(accessToken, trackId) {
  const id = encodeURIComponent(String(trackId).trim());
  await axios.delete(`${API_BASE}/reposts/tracks/${id}`, {
    headers: bearerHeaders(accessToken),
    validateStatus: (s) => s < 500
  });
  return true;
}

function isLikelySoundCloudTrackUrl(url) {
  return /soundcloud\.com|snd\.sc|on\.soundcloud\.com/i.test(String(url || ""));
}

module.exports = {
  isConfigured,
  exchangeAuthorizationCode,
  fetchAuthenticatedUser,
  resolveTrackUrl,
  listMyTracks,
  likeTrack,
  unlikeTrack,
  commentOnTrack,
  deleteTrackComment,
  repostTrack,
  deleteTrackRepost,
  isLikelySoundCloudTrackUrl,
  API_BASE
};
