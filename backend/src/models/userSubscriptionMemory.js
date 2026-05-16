module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "UserSubscriptionMemory",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      userId: { type: DataTypes.INTEGER, allowNull: false },
      channelKey: { type: DataTypes.STRING(255), allowNull: false },
      lastEngagementId: { type: DataTypes.INTEGER, allowNull: true },
      details: { type: DataTypes.TEXT, allowNull: true }
    },
    {
      tableName: "user_subscription_memory",
      timestamps: true,
      indexes: [{ unique: true, fields: ["userId", "channelKey"] }]
    }
  );
};
