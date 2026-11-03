const db = require("../models");
const { reverseEarnCredits, refundCredits } = require("./creditService");

/** Repost requests are 1-slot "share" campaigns aimed at one specific channel owner. */
function isTargetedRepostCampaign(campaign) {
  return (
    String(campaign?.engagementType || "") === "share" &&
    Number(campaign?.maxEngagements || 0) === 1 &&
    String(campaign?.name || "").startsWith("Repost request to")
  );
}

/**
 * Single source of truth for undoing a completed engagement (worker undo, admin reversal,
 * background audits).
 *
 * Credit rule: the campaign owner already paid for this slot when the budget was locked.
 *   - The worker's reward is clawed back (any shortfall becomes a debt that is burned, not paid out).
 *   - The slot is reopened so another worker can complete it.
 *   - The owner is NOT refunded (refund + reopen would pay for the same slot twice).
 *
 * Caller must pass an engagement loaded with `task` and `campaign` inside `transaction`
 * (ideally with lock: true).
 */
async function revertEngagement({ engagement, reason, transaction }) {
  const task = engagement.task;
  const campaign = engagement.campaign;
  const workerUserId = engagement.userId;
  const amount = Number(task?.rewardCredits || 0);

  const reversal =
    amount > 0
      ? await reverseEarnCredits({
          userId: workerUserId,
          amount,
          reason,
          referenceType: "task",
          referenceId: task.id,
          debtOwnerUserId: campaign?.userId || null,
          transaction
        })
      : { collected: 0, remaining: 0 };

  // Clear "already done" memory so the card becomes actionable again.
  if (campaign?.messageKey) {
    if (engagement.engagementType === "subscribe") {
      await db.UserSubscriptionMemory.destroy({
        where: { userId: workerUserId, channelKey: String(campaign.messageKey) },
        transaction
      });
    } else if (engagement.actionKind) {
      await db.UserPostAction.destroy({
        where: {
          userId: workerUserId,
          postKey: String(campaign.messageKey),
          actionKind: engagement.actionKind
        },
        transaction
      });
    }
  }

  await engagement.destroy({ transaction });

  if (task && campaign?.status === "cancelled") {
    // The campaign is stopped, so the slot cannot be refilled: close it and hand the owner
    // back what was actually recovered from the worker (never more, so nothing is minted).
    task.status = "cancelled";
    task.assignedUserId = null;
    task.assignedAt = null;
    task.completedAt = null;
    await task.save({ transaction });
    const recovered = Number(reversal?.collected || 0);
    if (recovered > 0 && campaign.userId) {
      await refundCredits({
        userId: campaign.userId,
        amount: recovered,
        reason: `Recovered from reverted engagement on cancelled campaign #${campaign.id}`,
        referenceType: "campaign",
        referenceId: campaign.id,
        transaction
      });
    }
  } else if (task && task.status !== "cancelled") {
    if (isTargetedRepostCampaign(campaign)) {
      // Keep the request addressed to the same channel owner (never open it to everyone).
      task.status = "assigned";
      task.assignedAt = new Date();
    } else {
      task.status = "open";
      task.assignedUserId = null;
      task.assignedAt = null;
    }
    task.completedAt = null;
    await task.save({ transaction });
  }

  // A freed slot reactivates an auto-completed campaign; never revive cancelled/paused ones.
  if (campaign && campaign.status === "completed") {
    const done = await db.Task.count({
      where: { campaignId: campaign.id, status: ["completed", "cancelled"] },
      transaction
    });
    if (done < Number(campaign.maxEngagements || 0)) {
      campaign.status = "active";
      await campaign.save({ transaction });
    }
  }

  return {
    collected: Number(reversal?.collected || 0),
    debt: Number(reversal?.remaining || 0),
    workerUserId,
    ownerUserId: campaign?.userId || null
  };
}

module.exports = { revertEngagement, isTargetedRepostCampaign };
