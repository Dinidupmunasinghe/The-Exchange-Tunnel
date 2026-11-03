const db = require("../models");
const { refundCredits } = require("./creditService");

function notFound(message = "Campaign not found") {
  const err = new Error(message);
  err.status = 404;
  return err;
}

/**
 * Unused budget = reward of every slot nobody has completed yet (open or assigned).
 * Completed slots were paid to workers; cancelled slots were already refunded.
 */
async function unusedBudget(campaignId, transaction) {
  const sum = await db.Task.sum("rewardCredits", {
    where: { campaignId, status: ["open", "assigned"] },
    transaction
  });
  return Math.max(0, Number(sum || 0));
}

async function lockCampaign({ campaignId, ownerUserId, transaction }) {
  const where = { id: campaignId };
  if (ownerUserId != null) where.userId = ownerUserId;
  const campaign = await db.Campaign.findOne({ where, transaction, lock: true });
  if (!campaign) throw notFound();
  return campaign;
}

/**
 * Deletes a campaign and refunds its unused budget exactly once. The campaign row is locked,
 * so two concurrent deletes (or a delete racing a task completion) cannot double-refund.
 */
async function deleteCampaignWithRefund({ campaignId, ownerUserId = null, reason, transaction }) {
  const campaign = await lockCampaign({ campaignId, ownerUserId, transaction });
  const refund = await unusedBudget(campaign.id, transaction);
  await db.Engagement.destroy({ where: { campaignId: campaign.id }, transaction });
  await db.Task.destroy({ where: { campaignId: campaign.id }, transaction });
  const destroyed = await db.Campaign.destroy({ where: { id: campaign.id }, transaction });
  if (destroyed !== 1) throw notFound();
  if (refund > 0) {
    await refundCredits({
      userId: campaign.userId,
      amount: refund,
      reason: reason || `Refund unused budget for deleted campaign #${campaign.id}`,
      referenceType: "campaign",
      referenceId: campaign.id,
      transaction
    });
  }
  return { campaign, refundedCredits: refund };
}

/** Stops a campaign for good: cancels unfinished slots and refunds them to the owner. */
async function cancelCampaignWithRefund({ campaignId, ownerUserId = null, reason, transaction }) {
  const campaign = await lockCampaign({ campaignId, ownerUserId, transaction });
  if (campaign.status === "cancelled") {
    const err = new Error("Campaign is already cancelled");
    err.status = 400;
    throw err;
  }
  const refund = await unusedBudget(campaign.id, transaction);
  await db.Task.update(
    { status: "cancelled", assignedUserId: null, assignedAt: null },
    { where: { campaignId: campaign.id, status: ["open", "assigned"] }, transaction }
  );
  campaign.status = "cancelled";
  await campaign.save({ transaction });
  if (refund > 0) {
    await refundCredits({
      userId: campaign.userId,
      amount: refund,
      reason: reason || `Refund unused budget for cancelled campaign #${campaign.id}`,
      referenceType: "campaign",
      referenceId: campaign.id,
      transaction
    });
  }
  return { campaign, refundedCredits: refund };
}

/** True once every slot is either completed or cancelled. */
async function isCampaignFinished(campaign, transaction) {
  const done = await db.Task.count({
    where: { campaignId: campaign.id, status: ["completed", "cancelled"] },
    transaction
  });
  return done >= Number(campaign.maxEngagements || 0);
}

module.exports = {
  deleteCampaignWithRefund,
  cancelCampaignWithRefund,
  isCampaignFinished,
  unusedBudget
};
