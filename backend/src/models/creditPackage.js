module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "CreditPackage",
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      credits: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      priceLkr: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
    },
    {
      tableName: "credit_packages",
      timestamps: true
    }
  );
};
