module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "RepostPricingRule",
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      minSubscribers: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      maxSubscribers: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      credits: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
    },
    {
      tableName: "repost_pricing_rules",
      timestamps: true
    }
  );
};
