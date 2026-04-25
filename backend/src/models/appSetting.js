module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "AppSetting",
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      key: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      value: { type: DataTypes.STRING(255), allowNull: false }
    },
    {
      tableName: "app_settings",
      timestamps: true
    }
  );
};
