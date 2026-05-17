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
      priceLkr: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      features: { type: DataTypes.TEXT, allowNull: true },
      isPopular: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
    },
    {
      tableName: "credit_packages",
      timestamps: true
    }
  );
};
