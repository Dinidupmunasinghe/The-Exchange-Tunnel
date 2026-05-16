module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "Task",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      campaignId: { type: DataTypes.INTEGER, allowNull: false },
      assignedUserId: { type: DataTypes.INTEGER, allowNull: true },
      engagementType: { type: DataTypes.STRING(32), allowNull: false },
      rewardCredits: { type: DataTypes.INTEGER, allowNull: false },
      status: {
        type: DataTypes.ENUM("open", "assigned", "completed", "cancelled"),
        allowNull: false,
        defaultValue: "open"
      },
      assignedAt: { type: DataTypes.DATE, allowNull: true },
      completedAt: { type: DataTypes.DATE, allowNull: true }
    },
    {
      tableName: "tasks",
      timestamps: true
    }
  );
};
