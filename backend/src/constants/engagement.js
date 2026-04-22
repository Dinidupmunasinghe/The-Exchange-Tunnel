/** Allowed campaign / task engagement bundles. */
const ENGAGEMENT_TYPES = ["subscribe", "like", "comment", "like_comment"];

const ACTION_KINDS = ["subscribe", "like", "comment"];

/** Single-button actions the earner can take (subset of bundle). */
function bundleAllowsAction(engagementType, action) {
  switch (engagementType) {
    case "subscribe":
      return action === "subscribe";
    case "like":
      return action === "like";
    case "comment":
      return action === "comment";
    case "like_comment":
      return action === "like" || action === "comment";
    default:
      return false;
  }
}

module.exports = { ENGAGEMENT_TYPES, ACTION_KINDS, bundleAllowsAction };
