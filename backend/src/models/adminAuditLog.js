module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "AdminAuditLog",
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      adminEmail: { type: DataTypes.STRING(160), allowNull: false },
      action: { type: DataTypes.STRING(120), allowNull: false },
      targetType: { type: DataTypes.STRING(60), allowNull: true },
      targetId: { type: DataTypes.STRING(60), allowNull: true },
      payload: { type: DataTypes.TEXT, allowNull: true },
      ip: { type: DataTypes.STRING(64), allowNull: true },
      userAgent: { type: DataTypes.STRING(255), allowNull: true }
    },
    {
      tableName: "admin_audit_logs",
      timestamps: true,
      indexes: [
        { fields: ["adminEmail"] },
        { fields: ["action"] },
        { fields: ["targetType", "targetId"] }
      ]
    }
  );
};
