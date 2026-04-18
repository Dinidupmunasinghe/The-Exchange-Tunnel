/**
 * Post-provider engagement validation (used after URL-specific API checks, if any).
 */
function verifyEngagement({ campaign, engagementType, proofText, verifiedViaProvider }) {
  if (!campaign || !engagementType) {
    return { isValid: false, metaEngagementId: null, reason: "Invalid payload" };
  }
  if (engagementType !== campaign.engagementType) {
    return { isValid: false, metaEngagementId: null, reason: "Wrong engagement type for campaign" };
  }
  if (verifiedViaProvider) {
    return {
      isValid: true,
      metaEngagementId: `provider-${Date.now()}`,
      reason: "Verified via provider or membership check"
    };
  }
  if (!proofText || proofText.trim().length < 10) {
    return { isValid: false, metaEngagementId: null, reason: "Proof text too short" };
  }
  return {
    isValid: true,
    metaEngagementId: `manual-${Date.now()}`,
    reason: "Verified with manual rule"
  };
}

module.exports = { verifyEngagement };
