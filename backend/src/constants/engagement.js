/** Allowed campaign / task engagement bundles (single action or combinations, or all three). */
const ENGAGEMENT_TYPES = [
  "subscribe",
  "like",
  "comment",
  "share",
  "like_comment",
  "like_share",
  "comment_share",
  "all"
];

const ACTION_KINDS = ["subscribe", "like", "comment", "share"];

/** Single-button actions the earner can take (subset of bundle). */
function bundleAllowsAction(engagementType, action) {
  switch (engagementType) {
    case "subscribe":
      return action === "subscribe";
    case "like":
      return action === "like";
    case "comment":
      return action === "comment";
    case "share":
      return action === "share";
    case "like_comment":
      return action === "like" || action === "comment";
    case "like_share":
      return action === "like" || action === "share";
    case "comment_share":
      return action === "comment" || action === "share";
    case "all":
      return action === "like" || action === "comment" || action === "share";
    default:
      return false;
  }
}

module.exports = { ENGAGEMENT_TYPES, ACTION_KINDS, bundleAllowsAction };
