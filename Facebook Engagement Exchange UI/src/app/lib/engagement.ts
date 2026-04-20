export type EngagementTypeId =
  | "subscribe"
  | "comment";

export type BaseEngagementKind = "comment";

/** The three actions users pick from; combinations map to API bundle types. */
export const BASE_ENGAGEMENT_CHOICES: {
  id: BaseEngagementKind;
  name: string;
  costHint: string;
  icon: string;
}[] = [
  { id: "comment", name: "Comment", costHint: "from 10 credits / completion", icon: "💬" }
];

/** Maps checkbox selection to the bundle `engagementType` the API expects. */
export function selectionToEngagementType(sel: Record<BaseEngagementKind, boolean>): EngagementTypeId | null {
  return sel.comment ? "comment" : null;
}

export const ENGAGEMENT_OPTIONS: {
  id: EngagementTypeId;
  name: string;
  cost: number;
  icon: string;
}[] = [
  { id: "subscribe", name: "Subscribers", cost: 5, icon: "🔔" },
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
    case "comment":
      return "This campaign only pays for comments.";
    default:
      return null;
  }
}

export function bundleAllowsAction(
  engagementType: string,
  action: "subscribe" | "comment"
): boolean {
  switch (engagementType) {
    case "subscribe":
      return action === "subscribe";
    case "comment":
      return action === "comment";
    default:
      return false;
  }
}
