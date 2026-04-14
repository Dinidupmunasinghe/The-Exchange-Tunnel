const axios = require("axios");
const env = require("../config/env");
const { decrypt } = require("../utils/crypto");

/**
 * Pull a stable id from many Facebook URL shapes (classic posts, pfbid, share short links, etc.).
 */
function extractPostIdFromFacebookUrl(urlString) {
  if (!urlString || typeof urlString !== "string") {
    return null;
  }
  const u = decodeURIComponent(urlString).trim();

  let m = u.match(/[?&]story_fbid=([A-Za-z0-9_-]+)/i);
  if (m) return m[1];

  m = u.match(/[?&]fbid=([A-Za-z0-9_-]+)/i);
  if (m) return m[1];

  m = u.match(/\/posts\/(pfbid0[a-zA-Z0-9_-]+)/i);
  if (m) return m[1];

  m = u.match(/\/posts\/(pfbid[a-zA-Z0-9_-]+)/i);
  if (m) return m[1];

  m = u.match(/\/posts\/(\d+)/i);
  if (m) return m[1];

  m = u.match(/\/share\/p\/([A-Za-z0-9_-]+)/i);
  if (m) return `share_${m[1]}`;

  m = u.match(/\/share\/r\/([A-Za-z0-9_-]+)/i);
  if (m) return `share_r_${m[1]}`;

  m = u.match(/facebook\.com\/(\d+)\/(\d+)(?:\/|$|\?)/i);
  if (m) return `${m[1]}_${m[2]}`;

  return null;
}

/** Sync helper — use {@link resolveFacebookPostIdFromUrl} for /share/p short links. */
function parsePostIdFromUrl(url) {
  return extractPostIdFromFacebookUrl(url);
}

function safeParseUrl(input) {
  try {
    return new URL(String(input || "").trim());
  } catch {
    return null;
  }
}

function normalizeFacebookPermalink(inputUrl) {
  const parsed = safeParseUrl(inputUrl);
  if (!parsed) return null;

  const host = parsed.hostname.replace(/^m\./i, "www.").replace(/^www\./i, "").toLowerCase();
  const path = decodeURIComponent(parsed.pathname || "").replace(/\/+$/, "");
  const params = parsed.searchParams;
  const storyFbid = params.get("story_fbid") || params.get("fbid") || "";
  const ownerId = params.get("id") || "";

  if (storyFbid && ownerId) {
    return `facebook.com/permalink?story_fbid=${storyFbid}&id=${ownerId}`;
  }

  const postsMatch = path.match(/^\/([^/]+)\/posts\/([^/?#]+)/i);
  if (postsMatch) {
    return `facebook.com/${postsMatch[1].toLowerCase()}/posts/${postsMatch[2]}`;
  }

  const numericPairMatch = path.match(/^\/(\d+)\/(\d+)$/);
  if (numericPairMatch) {
    return `facebook.com/${numericPairMatch[1]}/${numericPairMatch[2]}`;
  }

  return `facebook.com${path}`;
}

function extractFacebookPageHintFromUrl(inputUrl) {
  const parsed = safeParseUrl(inputUrl);
  if (!parsed) return null;

  const ownerId = parsed.searchParams.get("id");
  if (ownerId && /^\d+$/.test(ownerId)) {
    return ownerId;
  }

  const decodedPath = decodeURIComponent(parsed.pathname || "");
  const postsMatch = decodedPath.match(/^\/([^/]+)\/posts\/[^/]+/i);
  if (postsMatch) {
    return postsMatch[1];
  }

  const numericPairMatch = decodedPath.match(/^\/(\d+)\/(\d+)$/);
  if (numericPairMatch) {
    return numericPairMatch[1];
  }

  return null;
}

async function resolvePostIdFromPageFeed(pageId, pageAccessToken, originalUrl) {
  if (!pageId || !pageAccessToken || !originalUrl) {
    return null;
  }

  const target = normalizeFacebookPermalink(originalUrl);
  if (!target) {
    return null;
  }

  let nextUrl = `${env.meta.graphApiBase}/${encodeURIComponent(String(pageId).trim())}/posts`;
  for (let page = 0; page < 5 && nextUrl; page += 1) {
    try {
      const { data } = await axios.get(nextUrl, {
        params: nextUrl.includes("?")
          ? undefined
          : {
              access_token: pageAccessToken,
              fields: "id,permalink_url",
              limit: 100
            }
      });

      const posts = Array.isArray(data?.data) ? data.data : [];
      const match = posts.find((post) => normalizeFacebookPermalink(post?.permalink_url) === target);
      if (match?.id) {
        return String(match.id);
      }

      nextUrl = data?.paging?.next || null;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[page feed resolve] failed:", e.response?.data?.error || e.message);
      return null;
    }
  }

  return null;
}

/**
 * Facebook /share/p/ URLs usually redirect to a long URL containing pfbid or numeric ids (like a real browser).
 */
async function expandFacebookUrl(inputUrl) {
  try {
    const response = await axios.get(inputUrl, {
      maxRedirects: 25,
      timeout: 20000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml"
      },
      validateStatus: (status) => status >= 200 && status < 400
    });
    const req = response.request;
    const finalUrl =
      (req && req.res && req.res.responseUrl) ||
      (typeof response.request?.responseURL === "string" ? response.request.responseURL : null) ||
      inputUrl;
    return typeof finalUrl === "string" ? finalUrl.split("#")[0] : inputUrl;
  } catch {
    return inputUrl;
  }
}

/**
 * Resolves share/short links via redirects, then parses. Always returns something for valid facebook.com/share/p/... when possible.
 */
async function resolveFacebookPostIdFromUrl(inputUrl) {
  const trimmed = String(inputUrl || "").trim();
  const isFb =
    /^https?:\/\/(www\.)?facebook\.com\//i.test(trimmed) ||
    /^https?:\/\/m\.facebook\.com\//i.test(trimmed);
  if (!isFb) {
    return null;
  }

  let id = extractPostIdFromFacebookUrl(trimmed);
  if (id && !/^share_|^share_r_/.test(id)) {
    return id;
  }

  const expanded = await expandFacebookUrl(trimmed);
  id = extractPostIdFromFacebookUrl(expanded);
  if (id) {
    return id;
  }

  return extractPostIdFromFacebookUrl(trimmed);
}

/**
 * Resolve a pfbid / post ID to a real numeric Graph API ID.
 *
 * Strategy (stops on first success):
 *  1. Already numeric → return as-is
 *  2. pfbid: try page token direct node lookup
 *  3. pfbid: try app token direct node lookup
 *  4. originalUrl + page hint: resolve by scanning the page's own feed and matching permalink_url
 *  5. originalUrl: Graph URL-based lookup (?id={url})
 *  6. Fall back to rawId (let the caller surface the Facebook error)
 */
async function resolveToNumericPostId(rawId, pageAccessToken, originalUrl) {
  if (!rawId) return null;
  if (/^\d+(_\d+)?$/.test(String(rawId))) return String(rawId);

  const appId = env.meta.pagesAppId || env.meta.appId;
  const appSecret = env.meta.pagesAppSecret || env.meta.appSecret;
  const appToken = appId && appSecret ? `${appId}|${appSecret}` : null;

  if (/^pfbid/i.test(String(rawId))) {
    const encoded = encodeURIComponent(String(rawId).trim());

    // Attempt 1: page access token direct node lookup
    if (pageAccessToken) {
      try {
        const { data } = await axios.get(`${env.meta.graphApiBase}/${encoded}`, {
          params: { fields: "id", access_token: pageAccessToken }
        });
        if (data?.id) return String(data.id);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[pfbid resolve] page-token attempt failed:", e.response?.data?.error || e.message);
      }
    }

    // Attempt 2: app access token direct node lookup
    if (appToken) {
      try {
        const { data } = await axios.get(`${env.meta.graphApiBase}/${encoded}`, {
          params: { fields: "id", access_token: appToken }
        });
        if (data?.id) return String(data.id);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[pfbid resolve] app-token attempt failed:", e.response?.data?.error || e.message);
      }
    }
  }

  // Attempt 3: find the post by matching permalink_url inside the hinted Page's feed.
  const hintedPageId = extractFacebookPageHintFromUrl(originalUrl);
  if (hintedPageId && pageAccessToken && originalUrl) {
    const match = await resolvePostIdFromPageFeed(hintedPageId, pageAccessToken, originalUrl);
    if (match) {
      return match;
    }
  }

  // Attempt 4: URL-based lookup (GET /?id={url})
  const lookupUrl = originalUrl || null;
  if (lookupUrl && /facebook\.com/i.test(String(lookupUrl))) {
    const tokenToUse = appToken || pageAccessToken;
    if (tokenToUse) {
      try {
        const { data } = await axios.get(`${env.meta.graphApiBase}/`, {
          params: { id: lookupUrl, fields: "id", access_token: tokenToUse }
        });
        if (data?.id) return String(data.id);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[pfbid resolve] url-lookup attempt failed:", e.response?.data?.error || e.message);
      }
    }
  }

  // eslint-disable-next-line no-console
  console.warn("[pfbid resolve] all attempts failed for rawId:", rawId, "originalUrl:", originalUrl);
  return String(rawId);
}

/**
 * Optional app-access-token check so tokens must belong to your Meta app.
 * Requires META_APP_ID + META_APP_SECRET on the server.
 */
function getMetaAppCredentials(flow = "login") {
  if (flow === "pages") {
    return {
      appId: env.meta.pagesAppId || env.meta.appId,
      appSecret: env.meta.pagesAppSecret || env.meta.appSecret
    };
  }
  return {
    appId: env.meta.loginAppId || env.meta.appId,
    appSecret: env.meta.loginAppSecret || env.meta.appSecret
  };
}

async function assertTokenMatchesOurApp(userAccessToken, flow = "login") {
  const { appId, appSecret } = getMetaAppCredentials(flow);
  if (!appId || !appSecret) {
    return;
  }
  const appAccessToken = `${appId}|${appSecret}`;
  const { data } = await axios.get(`${env.meta.graphApiBase}/debug_token`, {
    params: { input_token: userAccessToken, access_token: appAccessToken }
  });
  const info = data.data;
  if (!info?.is_valid) {
    throw new Error("Invalid Facebook access token");
  }
  if (String(info.app_id) !== String(appId)) {
    throw new Error("Token was not issued for this Meta app");
  }
}

/**
 * Exchange OAuth `code` from `response_type=code` for a user access token (requires META_APP_SECRET).
 */
async function exchangeFacebookCodeForUserAccessToken(code, redirectUri, flow = "login") {
  if (!code || !redirectUri) {
    throw new Error("Missing authorization code or redirect URI");
  }
  const { appId, appSecret } = getMetaAppCredentials(flow);
  if (!appId || !appSecret) {
    throw new Error(
      "Set META_LOGIN_APP_ID/META_LOGIN_APP_SECRET and META_PAGES_APP_ID/META_PAGES_APP_SECRET in backend .env."
    );
  }
  try {
    const { data } = await axios.get(`${env.meta.graphApiBase}/oauth/access_token`, {
      params: {
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code
      }
    });
    if (!data.access_token) {
      const m = data.error && typeof data.error === "object" ? data.error.message : null;
      throw new Error(m || "Facebook did not return an access token");
    }
    return data.access_token;
  } catch (err) {
    const d = err.response && err.response.data;
    const msg =
      (d && d.error && d.error.message) ||
      (typeof d === "object" && d.error_message) ||
      err.message ||
      "Facebook code exchange failed";
    throw new Error(msg);
  }
}

async function fetchFacebookProfileByAccessToken(accessToken, flow = "login") {
  if (!accessToken) {
    throw new Error("Facebook token not found");
  }
  await assertTokenMatchesOurApp(accessToken, flow);
  // Only request fields allowed by the client login scope (e.g. public_profile).
  // Asking for `email` without the email permission breaks /me with an error from Graph.
  const response = await axios.get(`${env.meta.graphApiBase}/me`, {
    params: { access_token: accessToken, fields: "id,name" }
  });
  return response.data;
}

async function fetchFacebookProfile(encryptedToken) {
  const accessToken = decrypt(encryptedToken);
  return fetchFacebookProfileByAccessToken(accessToken);
}

async function fetchFacebookPosts(encryptedToken) {
  const accessToken = decrypt(encryptedToken);
  if (!accessToken) {
    throw new Error("Facebook token not found");
  }
  const response = await axios.get(`${env.meta.graphApiBase}/me/posts`, {
    params: { access_token: accessToken, fields: "id,message,created_time,permalink_url", limit: 25 }
  });
  return response.data.data || [];
}

async function fetchSelectedPagePostsByAccessToken(pageId, pageAccessToken) {
  if (!pageId || !pageAccessToken) {
    throw new Error("Selected Facebook Page not found");
  }
  try {
    const response = await axios.get(`${env.meta.graphApiBase}/${encodeURIComponent(String(pageId))}/posts`, {
      params: {
        access_token: pageAccessToken,
        fields: "id,message,created_time,permalink_url,full_picture,status_type",
        limit: 50
      }
    });
    return (response.data.data || []).map((post) => ({
      id: String(post.id),
      message: typeof post.message === "string" ? post.message : "",
      createdTime: post.created_time || null,
      permalinkUrl: typeof post.permalink_url === "string" ? post.permalink_url : "",
      previewImageUrl: typeof post.full_picture === "string" ? post.full_picture : null,
      statusType: typeof post.status_type === "string" ? post.status_type : null
    }));
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    throw new Error(msg || "Could not load selected Page posts");
  }
}

async function fetchManagedPagesByAccessToken(accessToken) {
  if (!accessToken) {
    throw new Error("Facebook token not found");
  }
  try {
    const response = await axios.get(`${env.meta.graphApiBase}/me/accounts`, {
      params: {
        access_token: accessToken,
        fields: "id,name,access_token,category,tasks,picture{url}",
        limit: 100
      }
    });
    return (response.data.data || []).map((page) => ({
      id: String(page.id),
      name: String(page.name || "Untitled Page"),
      category: page.category ? String(page.category) : null,
      accessToken: String(page.access_token || ""),
      tasks: Array.isArray(page.tasks) ? page.tasks.map(String) : [],
      pictureUrl: page.picture?.data?.url || null
    }));
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    throw new Error(msg || "Could not load managed Pages");
  }
}

async function fetchManagedPages(encryptedUserAccessToken) {
  const accessToken = decrypt(encryptedUserAccessToken);
  return fetchManagedPagesByAccessToken(accessToken);
}

const ogPreviewCache = new Map();
const OG_PREVIEW_TTL_MS = 15 * 60 * 1000;

function decodeBasicHtmlEntities(s) {
  if (!s || typeof s !== "string") return s;
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractMetaAttr(fragment, attrName) {
  const re = new RegExp(`${attrName}\\s*=\\s*["']([^"']*)["']`, "i");
  const m = fragment.match(re);
  if (m) return m[1];
  return null;
}

function parseOpenGraphFromHtml(html) {
  if (!html || typeof html !== "string") {
    return { imageUrl: null, title: null, description: null, isVideo: false };
  }
  const ogImages = [];
  let isVideo = false;
  const metaRe = /<meta\s+([^>]+)\/?>/gi;
  let m;
  while ((m = metaRe.exec(html)) !== null) {
    const attrs = m[1];
    const content = extractMetaAttr(attrs, "content");
    const property = extractMetaAttr(attrs, "property") || extractMetaAttr(attrs, "name");
    if (!content || !property) continue;
    const pl = property.toLowerCase();
    const val = decodeBasicHtmlEntities(content);
    if (pl === "og:image" || pl === "og:image:url" || pl === "og:image:secure_url") {
      ogImages.push(val);
    }
    if (pl === "og:video" || pl === "og:video:url" || pl === "og:video:secure_url") {
      isVideo = true;
    }
    if (pl === "og:type" && /video/.test(val)) {
      isVideo = true;
    }
  }

  if (ogImages.length === 0) {
    let g;
    const reA =
      /<meta[^>]+property=["']og:image(?::url|:secure_url)?["'][^>]*content=["']([^"']+)["'][^>]*>/gi;
    while ((g = reA.exec(html)) !== null) ogImages.push(decodeBasicHtmlEntities(g[1]));
    const reB =
      /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image(?::url|:secure_url)?["'][^>]*>/gi;
    while ((g = reB.exec(html)) !== null) ogImages.push(decodeBasicHtmlEntities(g[1]));
  }

  const pickImage = () => {
    if (ogImages.length === 0) return null;
    const withoutRsrc = ogImages.filter((u) => u && !/\/rsrc\.php\//i.test(u));
    const pool = withoutRsrc.length > 0 ? withoutRsrc : ogImages;
    const prefer = pool.find((u) => /scontent|fbcdn\.net|scontent\.xx\.fbcdn/i.test(u));
    return prefer || pool[0];
  };

  const titleMatch = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  const titleAlt = html.match(/content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  const ogTitle = titleMatch?.[1] || titleAlt?.[1];
  const descMatch = html.match(/property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
  const descAlt = html.match(/content=["']([^"']+)["'][^>]*property=["']og:description["']/i);
  const ogDesc = descMatch?.[1] || descAlt?.[1];

  return {
    imageUrl: pickImage(),
    title: ogTitle ? decodeBasicHtmlEntities(ogTitle) : null,
    description: ogDesc ? decodeBasicHtmlEntities(ogDesc) : null,
    isVideo
  };
}

function isAllowedFacebookPreviewHost(hostname) {
  if (!hostname) return false;
  const h = hostname.replace(/^www\./, "").toLowerCase();
  return (
    h === "facebook.com" ||
    h === "m.facebook.com" ||
    h === "fb.com" ||
    h === "fb.watch" ||
    h.endsWith(".facebook.com")
  );
}

/** Facebook (legacy) + SoundCloud track / profile URLs for Open Graph previews. */
function isAllowedOpenGraphPreviewHost(hostname) {
  if (!hostname) return false;
  if (isAllowedFacebookPreviewHost(hostname)) return true;
  const h = hostname.replace(/^www\./, "").toLowerCase();
  return (
    h === "soundcloud.com" ||
    h.endsWith(".soundcloud.com") ||
    h === "snd.sc" ||
    h === "on.soundcloud.com"
  );
}

/**
 * Best-effort preview by fetching the public post HTML and parsing Open Graph tags.
 * Many posts return thumbnails for images and videos; login-walled pages may return nothing.
 */
async function fetchFacebookPostOpenGraphPreview(inputUrl) {
  const trimmed = String(inputUrl || "").trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { imageUrl: null, title: null, description: null, isVideo: false };
  }
  if (!/^https?:$/i.test(parsed.protocol) || !isAllowedOpenGraphPreviewHost(parsed.hostname)) {
    return { imageUrl: null, title: null, description: null, isVideo: false };
  }

  const cacheKey = `${parsed.origin}${parsed.pathname}`.toLowerCase();
  const hit = ogPreviewCache.get(cacheKey);
  if (hit && Date.now() - hit.at < OG_PREVIEW_TTL_MS) {
    return hit.data;
  }

  const fetchUrl = await expandFacebookUrl(trimmed);
  let html = "";
  try {
    const response = await axios.get(fetchUrl, {
      maxRedirects: 12,
      timeout: 18000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      },
      validateStatus: (status) => status >= 200 && status < 400,
      responseType: "text"
    });
    html = typeof response.data === "string" ? response.data : String(response.data || "");
  } catch {
    const empty = { imageUrl: null, title: null, description: null, isVideo: false };
    ogPreviewCache.set(cacheKey, { at: Date.now(), data: empty });
    return empty;
  }

  const data = parseOpenGraphFromHtml(html);
  ogPreviewCache.set(cacheKey, { at: Date.now(), data });
  return data;
}

/**
 * Like a post/object as the selected Page.
 * @param {string} objectId  - pfbid or numeric post ID extracted from the URL
 * @param {string} pageAccessToken
 * @param {string} [originalUrl] - full original post URL; used as URL-lookup fallback
 */
async function likeObjectAsPage(objectId, pageAccessToken, originalUrl) {
  if (!objectId || !pageAccessToken) {
    throw new Error("Missing post id or selected Facebook Page");
  }
  const resolved = await resolveToNumericPostId(objectId, pageAccessToken, originalUrl);
  if (!resolved) {
    throw new Error(
      "This post is from a personal Facebook profile and cannot be liked via the API. " +
      "Only posts from public Facebook Pages are supported."
    );
  }
  const id = encodeURIComponent(String(resolved).trim());

  // Try reactions API first (works for all post types, all API versions)
  try {
    const { data } = await axios.post(`${env.meta.graphApiBase}/${id}/reactions`, null, {
      params: { type: "LIKE", access_token: pageAccessToken }
    });
    return data;
  } catch (reactErr) {
    const reactFbErr = reactErr.response?.data?.error;
    const reactCode = Number(reactFbErr?.code);

    if (reactCode === 12) {
      throw new Error(
        "Facebook could not process this post. " +
        "Ensure the post is from a public Facebook Page (not a personal profile) " +
        "and that your Page app has the pages_manage_engagement permission."
      );
    }

    if (reactCode !== 100) {
      const msg = reactFbErr?.message || reactErr.message;
      throw new Error(msg || "Facebook Page like failed");
    }
  }

  // Fallback: /likes endpoint (older Page post types)
  try {
    const { data } = await axios.post(`${env.meta.graphApiBase}/${id}/likes`, null, {
      params: { access_token: pageAccessToken }
    });
    return data;
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    throw new Error(msg || "Facebook Page like failed");
  }
}

/** Remove the selected Page's like/reaction from an object. */
async function unlikeObjectAsPage(objectId, pageAccessToken, originalUrl) {
  if (!objectId || !pageAccessToken) {
    throw new Error("Missing post id or selected Facebook Page");
  }
  const resolved = await resolveToNumericPostId(objectId, pageAccessToken, originalUrl);
  if (!resolved) {
    throw new Error("Could not resolve this Facebook Page post.");
  }
  const id = encodeURIComponent(String(resolved).trim());
  try {
    await axios.delete(`${env.meta.graphApiBase}/${id}/reactions`, {
      params: { type: "LIKE", access_token: pageAccessToken }
    });
    return true;
  } catch (reactErr) {
    const reactFbErr = reactErr.response?.data?.error;
    if (reactFbErr?.code !== 100 && reactFbErr?.code !== 12) {
      const msg = reactFbErr?.message || reactErr.message;
      throw new Error(msg || "Facebook Page unlike failed");
    }
  }
  try {
    await axios.delete(`${env.meta.graphApiBase}/${id}/likes`, {
      params: { access_token: pageAccessToken }
    });
    return true;
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    throw new Error(msg || "Facebook Page unlike failed");
  }
}

async function commentOnObjectAsPage(objectId, message, pageAccessToken, originalUrl) {
  if (!objectId || !pageAccessToken) {
    throw new Error("Missing post id or selected Facebook Page");
  }
  if (!message || !String(message).trim()) {
    throw new Error("Comment text is required");
  }
  const resolved = await resolveToNumericPostId(objectId, pageAccessToken, originalUrl);
  if (!resolved) {
    throw new Error("Could not resolve this Facebook Page post.");
  }
  const id = encodeURIComponent(String(resolved).trim());
  const url = `${env.meta.graphApiBase}/${id}/comments`;
  try {
    const { data } = await axios.post(url, null, {
      params: {
        access_token: pageAccessToken,
        message: String(message).trim()
      }
    });
    return data;
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    throw new Error(msg || "Facebook Page comment failed");
  }
}

async function shareLinkAsPage(pageId, link, message, pageAccessToken) {
  if (!pageId || !pageAccessToken) {
    throw new Error("Missing selected Facebook Page");
  }
  if (!link) {
    throw new Error("Missing Facebook post URL to share");
  }
  const id = encodeURIComponent(String(pageId).trim());
  const url = `${env.meta.graphApiBase}/${id}/feed`;
  try {
    const { data } = await axios.post(url, null, {
      params: {
        access_token: pageAccessToken,
        link: String(link).trim(),
        ...(message && String(message).trim() ? { message: String(message).trim() } : {})
      }
    });
    return data;
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    throw new Error(msg || "Facebook Page share failed");
  }
}

async function deleteObjectAsPage(objectId, pageAccessToken) {
  if (!objectId || !pageAccessToken) {
    throw new Error("Missing object id or selected Facebook Page");
  }
  const id = encodeURIComponent(String(objectId).trim());
  const url = `${env.meta.graphApiBase}/${id}`;
  try {
    await axios.delete(url, {
      params: { access_token: pageAccessToken }
    });
    return true;
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    throw new Error(msg || "Facebook Page delete failed");
  }
}

async function verifyEngagement({ campaign, engagementType, proofText, verifiedViaFacebook, verifiedViaProvider }) {
  if (!campaign || !engagementType) {
    return { isValid: false, metaEngagementId: null, reason: "Invalid payload" };
  }
  if (engagementType !== campaign.engagementType) {
    return { isValid: false, metaEngagementId: null, reason: "Wrong engagement type for campaign" };
  }
  const verifiedByApi = Boolean(verifiedViaProvider || verifiedViaFacebook);
  if (verifiedByApi) {
    return {
      isValid: true,
      metaEngagementId: `provider-graph-${Date.now()}`,
      reason: "Verified via provider API"
    };
  }
  // Placeholder verification until Meta webhook/check endpoints are connected.
  if (!proofText || proofText.trim().length < 10) {
    return { isValid: false, metaEngagementId: null, reason: "Proof text too short" };
  }
  return {
    isValid: true,
    metaEngagementId: `manual-${Date.now()}`,
    reason: "Temporarily verified with manual rule"
  };
}

module.exports = {
  parsePostIdFromUrl,
  extractPostIdFromFacebookUrl,
  resolveFacebookPostIdFromUrl,
  resolveToNumericPostId,
  assertTokenMatchesOurApp,
  exchangeFacebookCodeForUserAccessToken,
  fetchFacebookProfileByAccessToken,
  fetchFacebookProfile,
  fetchFacebookPosts,
  fetchSelectedPagePostsByAccessToken,
  fetchManagedPagesByAccessToken,
  fetchManagedPages,
  fetchFacebookPostOpenGraphPreview,
  isAllowedOpenGraphPreviewHost,
  likeObjectAsPage,
  unlikeObjectAsPage,
  commentOnObjectAsPage,
  shareLinkAsPage,
  deleteObjectAsPage,
  verifyEngagement,
  /** Preferred names for SoundCloud-branded stack (implementation still uses Meta Graph where applicable). */
  exchangeSoundCloudOAuthCodeForAccessToken: exchangeFacebookCodeForUserAccessToken,
  fetchOAuthProfileByAccessToken: fetchFacebookProfileByAccessToken,
  resolveExternalPostIdFromUrl: resolveFacebookPostIdFromUrl,
  fetchPostOpenGraphPreview: fetchFacebookPostOpenGraphPreview
};
