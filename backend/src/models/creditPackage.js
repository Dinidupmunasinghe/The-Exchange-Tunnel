module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "CreditPackage",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      tagline: { type: DataTypes.STRING(255), allowNull: true },
      priceLabel: { type: DataTypes.STRING(40), allowNull: true },
      pricePeriod: { type: DataTypes.STRING(24), allowNull: false, defaultValue: "/month" },
      credits: { type: DataTypes.INTEGER, allowNull: false },
      priceLkr: { type: DataTypes.DECIMAL(10, 2), allowNull: true, defaultValue: 0 },
      features: { type: DataTypes.TEXT, allowNull: true },
      isPopular: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      entitlements: { type: DataTypes.TEXT, allowNull: true },
      paypalPlanId: { type: DataTypes.STRING(80), allowNull: true },
      priceUsd: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      billingInterval: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "MONTH" },
      isFree: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
    },
    {
      tableName: "credit_packages",
      timestamps: true
    }
  );
};
