const {
  fetchOAuthProfileByAccessToken,
  fetchSelectedPagePostsByAccessToken,
  fetchPostOpenGraphPreview,
  exchangeSoundCloudOAuthCodeForAccessToken,
  fetchManagedPagesByAccessToken,
  fetchManagedPages
} = require("../services/soundcloudService");
const scNative = require("../services/soundcloudNativeService");
const { decrypt } = require("../utils/crypto");

async function isSoundCloudApiUser(accessToken) {
  if (!accessToken) return false;
  try {
    await scNative.fetchAuthenticatedUser(accessToken);
    return true;
  } catch {
    return false;
  }
}

function getSelectedActingAccountSession(user) {
  if (!user?.soundcloudActingAccountId || !user?.soundcloudActingAccountTokenEncrypted) {
    const error = new Error("Select a SoundCloud acting account in Settings first");
    error.status = 400;
    throw error;
  }
  return {
    pageId: String(user.soundcloudActingAccountId),
    pageName: user.soundcloudActingAccountName ? String(user.soundcloudActingAccountName) : null,
    pageToken: decrypt(user.soundcloudActingAccountTokenEncrypted)
  };
}

async function connectSoundCloud(req, res) {
  let accessToken = req.body.accessToken;
  const { code, redirectUri, codeVerifier } = req.body;

  if (!accessToken && code && redirectUri) {
    if (scNative.isConfigured() && codeVerifier) {
      try {
        const tok = await scNative.exchangeAuthorizationCode({ code, redirectUri, codeVerifier });
        accessToken = tok.access_token;
      } catch (err) {
        return res.status(400).json({ message: err.message || "SoundCloud token exchange failed" });
      }
    } else {
      try {
        accessToken = await exchangeSoundCloudOAuthCodeForAccessToken(code, redirectUri, "pages");
      } catch (err) {
        return res.status(400).json({ message: err.message || "OAuth code exchange failed" });
      }
    }
  }
  if (!accessToken) {
    return res.status(400).json({ message: "accessToken or code+redirectUri is required" });
  }

  let profile = await scNative.fetchAuthenticatedUser(accessToken).catch(() => null);
  if (!profile) {
    profile = await fetchOAuthProfileByAccessToken(accessToken, "pages").catch(() => null);
  }

  req.user.setSoundCloudToken(accessToken);

  if (profile?.id != null) {
    req.user.soundcloudUserId = String(profile.id);
    const nm = profile.username || profile.name || profile.permalink;
    if (!req.user.name && nm) req.user.name = String(nm);
  }

  await req.user.save();

  let pages;
  if (await isSoundCloudApiUser(accessToken)) {
    const me = await scNative.fetchAuthenticatedUser(accessToken);
    pages = [
      {
        id: String(me.id),
        name: me.username || me.permalink || "SoundCloud",
        category: null,
        tasks: [],
        pictureUrl: me.avatar_url || null,
        accessToken
      }
    ];
  } else {
    pages = await fetchManagedPagesByAccessToken(accessToken).catch(() => []);
  }

  return res.json({
    message: "SoundCloud account connected",
    pages: pages.map((page) => ({
      id: page.id,
      name: page.name,
      category: page.category,
      tasks: page.tasks,
      pictureUrl: page.pictureUrl
    }))
  });
}

async function getMyPosts(req, res) {
  try {
    const { pageId, pageName, pageToken } = getSelectedActingAccountSession(req.user);
    if (await isSoundCloudApiUser(pageToken)) {
      const posts = await scNative.listMyTracks(pageToken);
      return res.json({
        page: {
          id: pageId,
          name: pageName
        },
        posts
      });
    }
    const posts = await fetchSelectedPagePostsByAccessToken(pageId, pageToken);
    return res.json({
      page: {
        id: pageId,
        name: pageName
      },
      posts
    });
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message || "Could not load posts" });
  }
}

async function getPostPreview(req, res) {
  const url = typeof req.query.url === "string" ? req.query.url.trim() : "";
  if (!url) {
    return res.status(400).json({ message: "url query parameter is required" });
  }
  const preview = await fetchPostOpenGraphPreview(url);
  return res.json(preview);
}

async function getManagedAccounts(req, res) {
  if (!req.user.soundcloudAccessTokenEncrypted) {
    return res.status(400).json({ message: "SoundCloud account not connected" });
  }
  const userToken = decrypt(req.user.soundcloudAccessTokenEncrypted);

  if (await isSoundCloudApiUser(userToken)) {
    const me = await scNative.fetchAuthenticatedUser(userToken);
    return res.json({
      pages: [
        {
          id: String(me.id),
          name: me.username || me.permalink || "SoundCloud",
          category: null,
          tasks: [],
          pictureUrl: me.avatar_url || null,
          selected: req.user.soundcloudActingAccountId === String(me.id)
        }
      ],
      selectedPageId: req.user.soundcloudActingAccountId || null
    });
  }

  const pages = await fetchManagedPages(req.user.soundcloudAccessTokenEncrypted);
  return res.json({
    pages: pages.map((page) => ({
      id: page.id,
      name: page.name,
      category: page.category,
      tasks: page.tasks,
      pictureUrl: page.pictureUrl,
      selected: req.user.soundcloudActingAccountId === page.id
    })),
    selectedPageId: req.user.soundcloudActingAccountId || null
  });
}

async function selectManagedAccount(req, res) {
  const { pageId } = req.body;
  if (!req.user.soundcloudAccessTokenEncrypted) {
    return res.status(400).json({ message: "SoundCloud account not connected" });
  }
  const userToken = decrypt(req.user.soundcloudAccessTokenEncrypted);

  if (await isSoundCloudApiUser(userToken)) {
    const me = await scNative.fetchAuthenticatedUser(userToken);
    if (String(pageId) !== String(me.id)) {
      return res.status(404).json({ message: "Managed account not found" });
    }
    req.user.setSoundCloudActingAccountToken({
      id: String(me.id),
      name: me.username || me.permalink || "SoundCloud",
      accessToken: userToken
    });
    await req.user.save();
    return res.json({
      message: "SoundCloud acting account selected",
      page: {
        id: String(me.id),
        name: me.username || me.permalink,
        category: null,
        tasks: [],
        pictureUrl: me.avatar_url || null
      }
    });
  }

  const pages = await fetchManagedPages(req.user.soundcloudAccessTokenEncrypted);
  const page = pages.find((item) => item.id === String(pageId));
  if (!page || !page.accessToken) {
    return res.status(404).json({ message: "Managed account not found" });
  }

  req.user.setSoundCloudActingAccountToken(page);
  await req.user.save();
  return res.json({
    message: "SoundCloud acting account selected",
    page: {
      id: page.id,
      name: page.name,
      category: page.category,
      tasks: page.tasks,
      pictureUrl: page.pictureUrl
    }
  });
}

async function clearSelectedAccount(req, res) {
  req.user.clearSoundCloudActingAccount();
  await req.user.save();
  return res.json({ message: "Selected acting account removed" });
}

module.exports = {
  connectSoundCloud,
  getMyPosts,
  getPostPreview,
  getManagedAccounts,
  selectManagedAccount,
  clearSelectedAccount
};
