module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "Engagement",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      userId: { type: DataTypes.INTEGER, allowNull: false },
      campaignId: { type: DataTypes.INTEGER, allowNull: false },
      taskId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
      engagementType: { type: DataTypes.STRING(32), allowNull: false },
      /** Which button: like / comment / share (one per user per campaign per kind). */
      actionKind: { type: DataTypes.STRING(16), allowNull: true },
      metaEngagementId: { type: DataTypes.STRING(120), allowNull: true },
      verificationStatus: {
        type: DataTypes.ENUM("pending", "verified", "rejected"),
        allowNull: false,
        defaultValue: "pending"
      },
      verificationDetails: { type: DataTypes.TEXT, allowNull: true }
    },
    {
      tableName: "engagements",
      timestamps: true
    }
  );
};
