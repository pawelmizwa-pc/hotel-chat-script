import { SessionMemory } from "../types";

/**
 * Formats conversation history into well-structured markdown for LLM
 */
export function formatConversationHistory(
  sessionHistory: SessionMemory
): string {
  if (!sessionHistory.messages || sessionHistory.messages.length === 0) {
    return "## Conversation History\n\n*No previous messages*\n";
  }

  let formattedHistory = "## Conversation History\n\n";

  // Combine messages in chronological order
  const allMessages = [...sessionHistory.messages].sort(
    (a, b) => a.timestamp - b.timestamp
  );

  if (allMessages.length > 0) {
    formattedHistory += "### Recent Conversation\n\n";

    allMessages.forEach((msg, index) => {
      const messageNumber = index + 1;
      const role = msg.role === "user" ? "👤 **Guest**" : "🏨 **Assistant**";
      const timestamp = new Date(msg.timestamp).toLocaleTimeString();

      formattedHistory += `**${messageNumber}.** ${role} *(${timestamp})*\n`;
      formattedHistory += `${msg.content}\n\n`;
    });
  }

  return formattedHistory;
}
