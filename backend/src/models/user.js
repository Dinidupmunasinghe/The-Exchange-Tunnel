/** Legacy MySQL column names; attributes use Telegram names. */
module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    "User",
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      email: { type: DataTypes.STRING(120), allowNull: false, unique: true },
      passwordHash: { type: DataTypes.STRING(255), allowNull: false },
      name: { type: DataTypes.STRING(120), allowNull: true },
      telegramUserId: { type: DataTypes.STRING(80), allowNull: true, field: "facebookUserId" },
      userOAuthTokenEncrypted: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: "facebookAccessTokenEncrypted"
      },
      /** Selected Telegram channel (chat_id as string) used for your campaigns. */
      telegramActingChannelId: { type: DataTypes.STRING(80), allowNull: true, field: "facebookPageId" },
      telegramActingChannelTitle: {
        type: DataTypes.STRING(160),
        allowNull: true,
        field: "facebookPageName"
      },
      userActingTokenEncrypted: {
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

  User.prototype.setActingTelegramChannel = function setActingTelegramChannel(channel) {
    this.telegramActingChannelId = String(channel.id);
    this.telegramActingChannelTitle = channel.title ? String(channel.title) : null;
  };

  User.prototype.clearActingTelegramChannel = function clearActingTelegramChannel() {
    this.telegramActingChannelId = null;
    this.telegramActingChannelTitle = null;
    this.userActingTokenEncrypted = null;
  };

  return User;
};
