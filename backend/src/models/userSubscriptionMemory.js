module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "UserSubscriptionMemory",
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      channelKey: { type: DataTypes.STRING(255), allowNull: false },
      lastEngagementId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      details: { type: DataTypes.TEXT, allowNull: true }
    },
    {
      tableName: "user_subscription_memory",
      timestamps: true,
      indexes: [{ unique: true, fields: ["userId", "channelKey"] }]
    }
  );
};
