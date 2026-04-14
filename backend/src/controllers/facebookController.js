/**
 * @deprecated Use `./soundcloudController` and `/soundcloud/*` routes.
 */
const sc = require("./soundcloudController");

module.exports = {
  connectFacebook: sc.connectSoundCloud,
  getMyFacebookPosts: sc.getMyPosts,
  getPostPreview: sc.getPostPreview,
  getManagedPages: sc.getManagedAccounts,
  selectManagedPage: sc.selectManagedAccount,
  clearSelectedPage: sc.clearSelectedAccount
};
