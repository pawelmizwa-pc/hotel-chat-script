import { ChatMessage } from "../types";

/**
 * Validates and filters out empty or invalid messages
 * @param messages - Array of ChatMessages to validate
 * @returns Filtered array with only valid, non-empty messages
 */
export function validateMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((message) => {
    // Check if content exists and is not empty after trimming
    const hasValidContent =
      message.content && message.content.trim().length > 0;

    // Check if role is valid
    const hasValidRole =
      message.role && ["user", "assistant", "system"].includes(message.role);

    // Log filtered messages for debugging
    if (!hasValidContent || !hasValidRole) {
      console.warn("Filtering out invalid message:", {
        role: message.role,
        contentLength: message.content?.length || 0,
        isEmpty: !hasValidContent,
        invalidRole: !hasValidRole,
      });
    }

    return hasValidContent && hasValidRole;
  });
}

/**
 * Validates messages specifically for Anthropic provider
 * Anthropic has stricter requirements about empty messages
 * @param messages - Array of ChatMessages to validate
 * @returns Filtered array optimized for Anthropic
 */
export function validateMessagesForAnthropic(
  messages: ChatMessage[]
): ChatMessage[] {
  const validMessages = validateMessages(messages);

  // Anthropic doesn't allow consecutive assistant messages
  // Remove duplicate consecutive assistant messages
  const filteredMessages: ChatMessage[] = [];

  for (let i = 0; i < validMessages.length; i++) {
    const currentMessage = validMessages[i];
    const previousMessage = filteredMessages[filteredMessages.length - 1];

    // Skip if this is an assistant message and the previous was also assistant
    if (
      currentMessage.role === "assistant" &&
      previousMessage?.role === "assistant"
    ) {
      console.warn("Filtering out consecutive assistant message for Anthropic");
      continue;
    }

    filteredMessages.push(currentMessage);
  }

  return filteredMessages;
}
