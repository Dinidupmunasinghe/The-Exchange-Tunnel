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
      error: { type: DataTypes.TEXT, allowNull: true },
      /** PayPal subscription id (or other resource) this event concerns. */
      resourceId: { type: DataTypes.STRING(120), allowNull: true },
      /** Credits granted (+) or reversed (-) by this row; used for refunds. */
      creditsGranted: { type: DataTypes.INTEGER, allowNull: true },
      userId: { type: DataTypes.INTEGER, allowNull: true },
      /** Set while a worker processes the event (claim), cleared/overridden after 5 minutes. */
      processingAt: { type: DataTypes.DATE, allowNull: true }
    },
    {
      tableName: "payment_events",
      timestamps: true
    }
  );
};
