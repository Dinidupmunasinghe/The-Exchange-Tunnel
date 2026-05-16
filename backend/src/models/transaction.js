module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "Transaction",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      userId: { type: DataTypes.INTEGER, allowNull: false },
      type: { type: DataTypes.ENUM("earn", "spend"), allowNull: false },
      amount: { type: DataTypes.INTEGER, allowNull: false },
      reason: { type: DataTypes.STRING(255), allowNull: false },
      referenceType: { type: DataTypes.STRING(60), allowNull: true },
      referenceId: { type: DataTypes.INTEGER, allowNull: true }
    },
    {
      tableName: "transactions",
      timestamps: true
    }
  );
};
