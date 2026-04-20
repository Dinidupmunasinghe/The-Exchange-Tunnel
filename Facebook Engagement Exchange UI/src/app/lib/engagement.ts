export type EngagementTypeId =
  | "subscribe"
  | "like"
  | "comment"
  | "share"
  | "like_comment"
  | "like_share"
  | "comment_share"
  | "all";

export type BaseEngagementKind = "like" | "comment" | "share";

/** The three actions users pick from; combinations map to API bundle types. */
export const BASE_ENGAGEMENT_CHOICES: {
  id: BaseEngagementKind;
  name: string;
  costHint: string;
  icon: string;
}[] = [
  { id: "like", name: "Like", costHint: "from 5 credits / completion", icon: "👍" },
  { id: "comment", name: "Comment", costHint: "from 10 credits / completion", icon: "💬" },
  { id: "share", name: "Share", costHint: "from 15 credits / completion", icon: "🔄" }
];

/** Maps checkbox selection to the bundle `engagementType` the API expects. */
export function selectionToEngagementType(sel: Record<BaseEngagementKind, boolean>): EngagementTypeId | null {
  const { like, comment, share } = sel;
  const count = Number(like) + Number(comment) + Number(share);
  if (count === 0) return null;
  if (like && comment && share) return "all";
  if (like && comment) return "like_comment";
  if (like && share) return "like_share";
  if (comment && share) return "comment_share";
  if (like) return "like";
  if (comment) return "comment";
  return "share";
}

export const ENGAGEMENT_OPTIONS: {
  id: EngagementTypeId;
  name: string;
  cost: number;
  icon: string;
}[] = [
  { id: "subscribe", name: "Subscribers", cost: 5, icon: "🔔" },
  { id: "like", name: "Likes", cost: 5, icon: "👍" },
  { id: "comment", name: "Comments", cost: 10, icon: "💬" },
  { id: "share", name: "Shares", cost: 15, icon: "🔄" },
  { id: "like_comment", name: "Like + Comment", cost: 15, icon: "👍💬" },
  { id: "like_share", name: "Like + Share", cost: 20, icon: "👍🔄" },
  { id: "comment_share", name: "Comment + Share", cost: 25, icon: "💬🔄" },
  { id: "all", name: "Like + Comment + Share", cost: 30, icon: "✨" }
];

export function getEngagementLabel(type: string): string {
  const opt = ENGAGEMENT_OPTIONS.find((o) => o.id === type);
  return opt?.name ?? type;
}

/** Short hint on Earn Credits for why some action buttons are disabled. */
export function getBundleActionHint(engagementType: string): string | null {
  switch (engagementType) {
    case "subscribe":
      return "This campaign pays for channel subscriptions only.";
    case "like":
      return "This campaign only pays for likes — the poster didn’t buy comments or shares.";
    case "comment":
      return "This campaign only pays for comments.";
    case "share":
      return "This campaign only pays for shares.";
    case "like_comment":
      return "Like and comment count; share wasn’t included in this bundle.";
    case "like_share":
      return "Like and share count; comment wasn’t included in this bundle.";
    case "comment_share":
      return "Comment and share count; like wasn’t included in this bundle.";
    case "all":
      return null;
    default:
      return null;
  }
}

export function bundleAllowsAction(
  engagementType: string,
  action: "subscribe" | "like" | "comment" | "share"
): boolean {
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
      return true;
    default:
      return false;
  }
}
