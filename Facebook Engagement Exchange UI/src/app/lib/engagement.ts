export type EngagementTypeId =
  | "subscribe"
  | "like"
  | "comment"
  | "like_comment";

export type BaseEngagementKind = "like" | "comment";

/** The three actions users pick from; combinations map to API bundle types. */
export const BASE_ENGAGEMENT_CHOICES: {
  id: BaseEngagementKind;
  name: string;
  costHint: string;
  icon: string;
}[] = [
  { id: "like", name: "Like", costHint: "from 5 credits / completion", icon: "👍" },
  { id: "comment", name: "Comment", costHint: "from 10 credits / completion", icon: "💬" }
];

/** Maps checkbox selection to the bundle `engagementType` the API expects. */
export function selectionToEngagementType(sel: Record<BaseEngagementKind, boolean>): EngagementTypeId | null {
  if (sel.like && sel.comment) return "like_comment";
  if (sel.like) return "like";
  if (sel.comment) return "comment";
  return null;
}

export const ENGAGEMENT_OPTIONS: {
  id: EngagementTypeId;
  name: string;
  cost: number;
  icon: string;
}[] = [
  { id: "subscribe", name: "Subscribers", cost: 5, icon: "🔔" },
  { id: "like", name: "Likes", cost: 5, icon: "👍" },
  { id: "like_comment", name: "Like + Comment", cost: 15, icon: "👍💬" },
  { id: "comment", name: "Comments", cost: 10, icon: "💬" }
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
      return "This campaign only pays for likes.";
    case "comment":
      return "This campaign only pays for comments.";
    case "like_comment":
      return "This campaign pays for both like and comment actions.";
    default:
      return null;
  }
}

export function bundleAllowsAction(
  engagementType: string,
  action: "subscribe" | "like" | "comment"
): boolean {
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
