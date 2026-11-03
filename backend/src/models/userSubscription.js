module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "UserSubscription",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      userId: { type: DataTypes.INTEGER, allowNull: false },
      packageId: { type: DataTypes.INTEGER, allowNull: false },
      status: {
        type: DataTypes.ENUM("active", "past_due", "cancelled", "expired"),
        allowNull: false,
        defaultValue: "active"
      },
      paypalSubscriptionId: { type: DataTypes.STRING(80), allowNull: true },
      paypalPayerId: { type: DataTypes.STRING(80), allowNull: true },
      currentPeriodStart: { type: DataTypes.DATE, allowNull: true },
      currentPeriodEnd: { type: DataTypes.DATE, allowNull: true },
      cancelAtPeriodEnd: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
    },
    {
      tableName: "user_subscriptions",
      timestamps: true,
      indexes: [
        { fields: ["userId"] },
        { fields: ["paypalSubscriptionId"] },
        { fields: ["status"] }
      ]
    }
  );
};
