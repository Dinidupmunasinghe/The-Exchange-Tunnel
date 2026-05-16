module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "RepostPricingRule",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      minSubscribers: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      maxSubscribers: { type: DataTypes.INTEGER, allowNull: true },
      credits: { type: DataTypes.INTEGER, allowNull: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
    },
    {
      tableName: "repost_pricing_rules",
      timestamps: true
    }
  );
};
