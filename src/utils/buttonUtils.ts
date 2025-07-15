import { ButtonInteraction } from "../types";

/**
 * Validate button interaction data
 * @param buttonData - Button interaction data to validate
 * @returns true if valid, false otherwise
 */
export function validateButtonInteraction(
  buttonData: ButtonInteraction
): boolean {
  if (!buttonData || typeof buttonData !== "object") {
    return false;
  }

  // Required fields
  const requiredFields = [
    "messageType",
    "buttonClicked",
    "buttonType",
    "buttonTitle",
    "isUpsell",
  ];

  for (const field of requiredFields) {
    if (
      !(field in buttonData) ||
      buttonData[field as keyof ButtonInteraction] === undefined
    ) {
      return false;
    }
  }

  // Validate field types
  if (
    typeof buttonData.buttonClicked !== "boolean" ||
    typeof buttonData.isUpsell !== "boolean" ||
    typeof buttonData.buttonTitle !== "string" ||
    !buttonData.buttonTitle.trim()
  ) {
    return false;
  }

  // Validate enum values
  const validMessageTypes = [
    "dynamic_button",
    "quick_reply",
    "persistent_menu",
  ];
  const validButtonTypes = [
    "quick_reply",
    "postback",
    "web_url",
    "call",
    "upsell",
  ];

  if (
    !validMessageTypes.includes(buttonData.messageType) ||
    !validButtonTypes.includes(buttonData.buttonType)
  ) {
    return false;
  }

  return true;
}

/**
 * Clean button interaction data by removing empty values and trimming strings
 * @param buttonData - Button interaction data to clean
 * @returns Cleaned button interaction data
 */
export function cleanButtonInteraction(
  buttonData: ButtonInteraction
): ButtonInteraction {
  const cleaned: ButtonInteraction = {
    messageType: buttonData.messageType,
    buttonClicked: buttonData.buttonClicked,
    buttonType: buttonData.buttonType,
    buttonTitle: buttonData.buttonTitle.trim(),
    isUpsell: buttonData.isUpsell,
  };

  // Add optional fields if they exist and are not empty
  if (buttonData.buttonPayload && buttonData.buttonPayload.trim()) {
    cleaned.buttonPayload = buttonData.buttonPayload.trim();
  }

  if (buttonData.clickTimestamp && buttonData.clickTimestamp.trim()) {
    cleaned.clickTimestamp = buttonData.clickTimestamp.trim();
  }

  if (buttonData.previousMessageId && buttonData.previousMessageId.trim()) {
    cleaned.previousMessageId = buttonData.previousMessageId.trim();
  }

  return cleaned;
}

/**
 * Create button analytics summary
 * @param buttonData - Button interaction data
 * @returns Button analytics summary
 */
export function createButtonAnalyticsSummary(buttonData: ButtonInteraction): {
  category: string;
  isEngagement: boolean;
  isUpsell: boolean;
  interactionType: string;
  hasPayload: boolean;
} {
  return {
    category: categorizeButton(buttonData.buttonTitle),
    isEngagement: buttonData.buttonClicked,
    isUpsell: buttonData.isUpsell,
    interactionType: `${buttonData.messageType}-${buttonData.buttonType}`,
    hasPayload: !!buttonData.buttonPayload,
  };
}

/**
 * Categorize buttons based on their title for analytics
 * @param buttonTitle - The title of the button
 * @returns Category string
 */
function categorizeButton(buttonTitle: string): string {
  const title = buttonTitle.toLowerCase();

  if (
    title.includes("spa") ||
    title.includes("massage") ||
    title.includes("wellness")
  ) {
    return "spa-wellness";
  }

  if (
    title.includes("restaurant") ||
    title.includes("menu") ||
    title.includes("dining") ||
    title.includes("food")
  ) {
    return "dining";
  }

  if (
    title.includes("room") ||
    title.includes("booking") ||
    title.includes("reservation")
  ) {
    return "accommodation";
  }

  if (
    title.includes("activity") ||
    title.includes("attraction") ||
    title.includes("tour")
  ) {
    return "activities";
  }

  if (
    title.includes("contact") ||
    title.includes("help") ||
    title.includes("support")
  ) {
    return "support";
  }

  if (
    title.includes("premium") ||
    title.includes("upgrade") ||
    title.includes("vip")
  ) {
    return "upsell";
  }

  return "general";
}

/**
 * Calculate button engagement metrics
 * @param buttonInteractions - Array of button interactions
 * @returns Engagement metrics
 */
export function calculateButtonEngagement(
  buttonInteractions: ButtonInteraction[]
): {
  totalButtons: number;
  clickedButtons: number;
  engagementRate: number;
  upsellRate: number;
  topCategories: Array<{ category: string; count: number }>;
} {
  const totalButtons = buttonInteractions.length;
  const clickedButtons = buttonInteractions.filter(
    (b) => b.buttonClicked
  ).length;
  const upsellButtons = buttonInteractions.filter(
    (b) => b.isUpsell && b.buttonClicked
  ).length;

  // Categorize clicked buttons
  const categoryCount: Record<string, number> = {};
  buttonInteractions
    .filter((b) => b.buttonClicked)
    .forEach((b) => {
      const category = categorizeButton(b.buttonTitle);
      categoryCount[category] = (categoryCount[category] || 0) + 1;
    });

  const topCategories = Object.entries(categoryCount)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalButtons,
    clickedButtons,
    engagementRate: totalButtons > 0 ? clickedButtons / totalButtons : 0,
    upsellRate: clickedButtons > 0 ? upsellButtons / clickedButtons : 0,
    topCategories,
  };
}

/**
 * Generate button payload for specific actions
 * @param action - The action type
 * @param params - Additional parameters
 * @returns Generated button payload
 */
export function generateButtonPayload(
  action: string,
  params?: Record<string, any>
): string {
  const payload = { action, ...params };
  return JSON.stringify(payload);
}

/**
 * Parse button payload
 * @param payload - The button payload string
 * @returns Parsed payload object
 */
export function parseButtonPayload(
  payload: string
): Record<string, any> | null {
  try {
    return JSON.parse(payload);
  } catch (error) {
    console.warn("Error parsing button payload:", error);
    return null;
  }
}
