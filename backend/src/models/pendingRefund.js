module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "PendingRefund",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      workerUserId: { type: DataTypes.INTEGER, allowNull: false },
      ownerUserId: { type: DataTypes.INTEGER, allowNull: false },
      amountRemaining: { type: DataTypes.INTEGER, allowNull: false },
      reason: { type: DataTypes.STRING(255), allowNull: false },
      referenceType: { type: DataTypes.STRING(60), allowNull: true },
      referenceId: { type: DataTypes.INTEGER, allowNull: true },
      status: { type: DataTypes.ENUM("pending", "settled"), allowNull: false, defaultValue: "pending" },
      settledAt: { type: DataTypes.DATE, allowNull: true }
    },
    {
      tableName: "pending_refunds",
      timestamps: true,
      indexes: [{ fields: ["workerUserId", "status"] }, { fields: ["ownerUserId", "status"] }]
    }
  );
};
