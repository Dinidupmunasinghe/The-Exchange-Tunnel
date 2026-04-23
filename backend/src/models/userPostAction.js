module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "UserPostAction",
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      postKey: { type: DataTypes.STRING(255), allowNull: false },
      actionKind: { type: DataTypes.ENUM("like", "comment"), allowNull: false },
      lastEngagementId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      details: { type: DataTypes.TEXT, allowNull: true }
    },
    {
      tableName: "user_post_actions",
      timestamps: true,
      indexes: [{ unique: true, fields: ["userId", "postKey", "actionKind"] }]
    }
  );
};
