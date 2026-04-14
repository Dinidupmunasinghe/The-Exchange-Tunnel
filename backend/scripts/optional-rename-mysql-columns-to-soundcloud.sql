-- Optional one-time migration: rename legacy `facebook*` physical columns to SoundCloud-oriented names.
-- BACK UP YOUR DATABASE FIRST.
--
-- After running successfully:
--   1. Remove every `field: "facebook..."` mapping from Sequelize models (see `src/models/user.js`,
--      `src/models/campaign.js`) so attribute names match the new column names.
--   2. Update `src/server.js` function `ensureDevSchema` / `addColumnIfMissing` to use the new
--      column names (or remove those checks if columns already exist).
--
-- If you skip this script, Sequelize keeps using `field:` to map `soundcloud*` attributes to the
-- old `facebook*` column names — that is a supported configuration.

START TRANSACTION;

ALTER TABLE users
  RENAME COLUMN facebookUserId TO soundcloudUserId,
  RENAME COLUMN facebookAccessTokenEncrypted TO soundcloudAccessTokenEncrypted,
  RENAME COLUMN facebookPageId TO soundcloudActingAccountId,
  RENAME COLUMN facebookPageName TO soundcloudActingAccountName,
  RENAME COLUMN facebookPageAccessTokenEncrypted TO soundcloudActingAccountTokenEncrypted;

ALTER TABLE campaigns
  RENAME COLUMN facebookPostId TO soundcloudPostId,
  RENAME COLUMN facebookPostUrl TO soundcloudPostUrl;

COMMIT;
