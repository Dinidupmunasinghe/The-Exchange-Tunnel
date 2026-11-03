const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const User = require("./user")(sequelize, DataTypes);
const Campaign = require("./campaign")(sequelize, DataTypes);
const Task = require("./task")(sequelize, DataTypes);
const Transaction = require("./transaction")(sequelize, DataTypes);
const Engagement = require("./engagement")(sequelize, DataTypes);
const UserPostAction = require("./userPostAction")(sequelize, DataTypes);
const PendingRefund = require("./pendingRefund")(sequelize, DataTypes);
const UserSubscriptionMemory = require("./userSubscriptionMemory")(sequelize, DataTypes);
const AppSetting = require("./appSetting")(sequelize, DataTypes);
const CreditPackage = require("./creditPackage")(sequelize, DataTypes);
const UserSubscription = require("./userSubscription")(sequelize, DataTypes);
const PaymentEvent = require("./paymentEvent")(sequelize, DataTypes);
const AdminAuditLog = require("./adminAuditLog")(sequelize, DataTypes);
const RepostPricingRule = require("./repostPricingRule")(sequelize, DataTypes);

User.hasMany(Campaign, { foreignKey: "userId", as: "campaigns" });
Campaign.belongsTo(User, { foreignKey: "userId", as: "owner" });

Campaign.hasMany(Task, { foreignKey: "campaignId", as: "tasks" });
Task.belongsTo(Campaign, { foreignKey: "campaignId", as: "campaign" });

User.hasMany(Task, { foreignKey: "assignedUserId", as: "assignedTasks" });
Task.belongsTo(User, { foreignKey: "assignedUserId", as: "assignee" });

User.hasMany(Transaction, { foreignKey: "userId", as: "transactions" });
Transaction.belongsTo(User, { foreignKey: "userId", as: "user" });

User.hasMany(Engagement, { foreignKey: "userId", as: "engagements" });
Engagement.belongsTo(User, { foreignKey: "userId", as: "user" });

Campaign.hasMany(Engagement, { foreignKey: "campaignId", as: "engagements" });
Engagement.belongsTo(Campaign, { foreignKey: "campaignId", as: "campaign" });

Task.hasOne(Engagement, { foreignKey: "taskId", as: "engagement" });
Engagement.belongsTo(Task, { foreignKey: "taskId", as: "task" });

User.hasMany(UserPostAction, { foreignKey: "userId", as: "postActions" });
UserPostAction.belongsTo(User, { foreignKey: "userId", as: "user" });

User.hasMany(PendingRefund, { foreignKey: "workerUserId", as: "refundDebtsAsWorker" });
User.hasMany(PendingRefund, { foreignKey: "ownerUserId", as: "refundDebtsAsOwner" });
PendingRefund.belongsTo(User, { foreignKey: "workerUserId", as: "worker" });
PendingRefund.belongsTo(User, { foreignKey: "ownerUserId", as: "owner" });

User.hasMany(UserSubscriptionMemory, { foreignKey: "userId", as: "subscriptionMemory" });
UserSubscriptionMemory.belongsTo(User, { foreignKey: "userId", as: "user" });

User.hasMany(UserSubscription, { foreignKey: "userId", as: "subscriptions" });
UserSubscription.belongsTo(User, { foreignKey: "userId", as: "user" });
CreditPackage.hasMany(UserSubscription, { foreignKey: "packageId", as: "subscriptions" });
UserSubscription.belongsTo(CreditPackage, { foreignKey: "packageId", as: "package" });

const db = {
  sequelize,
  User,
  Campaign,
  Task,
  Transaction,
  Engagement,
  UserPostAction,
  PendingRefund,
  UserSubscriptionMemory
  ,
  AppSetting,
  CreditPackage,
  UserSubscription,
  PaymentEvent,
  AdminAuditLog,
  RepostPricingRule
};

module.exports = db;
