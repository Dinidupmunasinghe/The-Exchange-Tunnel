const express = require("express");
const tg = require("../services/telegramService");
const { verifyTelegramPhotoSignature } = require("../utils/mediaSigning");

const router = express.Router();

/**
 * GET /api/media/tg/:kind/:id?exp=&sig=
 * Streams a Telegram chat/user photo without exposing the bot token. Authorised by an
 * HMAC signature issued by the API (see utils/mediaSigning.js) so <img> tags work.
 */
router.get("/tg/:kind/:id", async (req, res) => {
  const { kind, id } = req.params;
  if (!verifyTelegramPhotoSignature(kind, id, req.query.exp, req.query.sig)) {
    return res.status(403).end();
  }
  const filePath =
    kind === "chat" ? await tg.resolveChatPhotoFilePath(id) : await tg.resolveUserPhotoFilePath(id);
  if (!filePath) return res.status(404).end();

  const file = await tg.fetchTelegramFileStream(filePath).catch(() => null);
  if (!file) return res.status(404).end();

  const type = file.contentType.startsWith("image/") ? file.contentType : "image/jpeg";
  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", "private, max-age=3600");
  // Helmet defaults to same-origin; the UI may be served from another origin (Vercel).
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  file.stream.on("error", () => res.destroy());
  file.stream.pipe(res);
});

module.exports = router;
