const { encrypt } = require("../utils/crypto");

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    "User",
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      email: { type: DataTypes.STRING(120), allowNull: false, unique: true },
      passwordHash: { type: DataTypes.STRING(255), allowNull: false },
      name: { type: DataTypes.STRING(120), allowNull: true },
      /** OAuth subject id (stored in legacy `facebookUserId` column). */
      soundcloudUserId: { type: DataTypes.STRING(80), allowNull: true, field: "facebookUserId" },
      soundcloudAccessTokenEncrypted: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: "facebookAccessTokenEncrypted"
      },
      /** Acting account for automated actions (legacy Meta "Page" id column). */
      soundcloudActingAccountId: { type: DataTypes.STRING(80), allowNull: true, field: "facebookPageId" },
      soundcloudActingAccountName: {
        type: DataTypes.STRING(160),
        allowNull: true,
        field: "facebookPageName"
      },
      soundcloudActingAccountTokenEncrypted: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: "facebookPageAccessTokenEncrypted"
      },
      credits: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      dailyEarnedCredits: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      dailyEarnedAt: { type: DataTypes.DATEONLY, allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
    },
    {
      tableName: "users",
      timestamps: true
    }
  );

  User.prototype.setSoundCloudToken = function setSoundCloudToken(accessToken) {
    this.soundcloudAccessTokenEncrypted = encrypt(accessToken);
  };

  User.prototype.setSoundCloudActingAccountToken = function setSoundCloudActingAccountToken(page) {
    this.soundcloudActingAccountId = page.id;
    this.soundcloudActingAccountName = page.name;
    this.soundcloudActingAccountTokenEncrypted = encrypt(page.accessToken);
  };

  User.prototype.clearSoundCloudActingAccount = function clearSoundCloudActingAccount() {
    this.soundcloudActingAccountId = null;
    this.soundcloudActingAccountName = null;
    this.soundcloudActingAccountTokenEncrypted = null;
  };

  /** @deprecated Use setSoundCloudToken */
  User.prototype.setFacebookToken = User.prototype.setSoundCloudToken;
  /** @deprecated Use setSoundCloudActingAccountToken */
  User.prototype.setFacebookPageToken = User.prototype.setSoundCloudActingAccountToken;
  /** @deprecated Use clearSoundCloudActingAccount */
  User.prototype.clearFacebookPage = User.prototype.clearSoundCloudActingAccount;

  return User;
};
