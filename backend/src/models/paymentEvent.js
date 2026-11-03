module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "PaymentEvent",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      provider: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "paypal" },
      eventId: { type: DataTypes.STRING(120), allowNull: false, unique: true },
      eventType: { type: DataTypes.STRING(80), allowNull: false },
      payload: { type: DataTypes.TEXT, allowNull: true },
      processedAt: { type: DataTypes.DATE, allowNull: true },
      error: { type: DataTypes.TEXT, allowNull: true }
    },
    {
      tableName: "payment_events",
      timestamps: true
    }
  );
};
