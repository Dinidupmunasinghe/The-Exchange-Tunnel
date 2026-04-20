/** Allowed campaign / task engagement bundles. */
const ENGAGEMENT_TYPES = ["subscribe", "comment"];

const ACTION_KINDS = ["subscribe", "comment"];

/** Single-button actions the earner can take (subset of bundle). */
function bundleAllowsAction(engagementType, action) {
  switch (engagementType) {
    case "subscribe":
      return action === "subscribe";
    case "comment":
      return action === "comment";
    default:
      return false;
  }
}

module.exports = { ENGAGEMENT_TYPES, ACTION_KINDS, bundleAllowsAction };
