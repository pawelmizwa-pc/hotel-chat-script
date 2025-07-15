import { Env, SessionMemory } from "../types";

export class MemoryService {
  private kv: KVNamespace;
  private contextWindowLength: number;
  private readonly MESSAGE_EXPIRY_MS = 4 * 60 * 60 * 1000; // 4 hours in milliseconds

  constructor(env: Env) {
    this.kv = env.CHAT_SESSIONS;
    this.contextWindowLength = parseInt(env.CONTEXT_WINDOW_LENGTH) || 15;
  }

  private getSessionKey(tenantId: string, sessionId: string): string {
    return `session:${tenantId}:${sessionId}`;
  }

  private getEmailSessionKey(tenantId: string, sessionId: string): string {
    return `email-session:${tenantId}:${sessionId}`;
  }

  /**
   * Filter messages to only include those newer than 4 hours
   * @param memory - SessionMemory to filter
   * @returns SessionMemory with filtered messages
   */
  private filterRecentMessages(memory: SessionMemory): SessionMemory {
    const currentTime = Date.now();
    const cutoffTime = currentTime - this.MESSAGE_EXPIRY_MS;

    const filteredMessages = memory.messages.filter(
      (message) => message.timestamp > cutoffTime
    );

    return {
      ...memory,
      messages: filteredMessages,
    };
  }

  async getSessionMemory(
    tenantId: string,
    sessionId: string
  ): Promise<SessionMemory | null> {
    try {
      const key = this.getSessionKey(tenantId, sessionId);
      const data = await this.kv.get(key, "text");
      if (!data) return null;

      const sessionMemory = JSON.parse(data) as SessionMemory;

      // Filter messages to only include those from the last 4 hours
      const filteredMemory = this.filterRecentMessages(sessionMemory);

      return filteredMemory;
    } catch (error) {
      console.error(
        `Error getting session memory for ${tenantId}:${sessionId}:`,
        error
      );
      return null;
    }
  }

  async saveSessionMemory(
    tenantId: string,
    sessionId: string,
    memory: SessionMemory
  ): Promise<void> {
    try {
      const key = this.getSessionKey(tenantId, sessionId);

      // Apply context window limit
      if (memory.messages.length > this.contextWindowLength) {
        memory.messages = memory.messages.slice(-this.contextWindowLength);
      }

      memory.updatedAt = new Date().toISOString();

      await this.kv.put(key, JSON.stringify(memory), {
        expirationTtl: 86400 * 7, // 7 days expiration
      });
    } catch (error) {
      console.error(`Error saving session memory for ${sessionId}:`, error);
      throw error;
    }
  }

  async updateSessionWithConversation(
    {
      tenantId,
      sessionId,
      sessionMemory,
      userMessage,
      assistantResponse,
    }: {
      tenantId: string;
      sessionId: string;
      sessionMemory: SessionMemory;
      userMessage: string;
      assistantResponse: string;
    }
  ): Promise<void> {
    try {
      // Add user message to memory
      sessionMemory.messages.push({
        role: "user",
        content: userMessage,
        timestamp: Date.now(),
      });

      // Add assistant response to memory
      sessionMemory.messages.push({
        role: "assistant",
        content: assistantResponse,
        timestamp: Date.now(),
      });

      // Save updated session memory
      await this.saveSessionMemory(tenantId, sessionId, sessionMemory);
    } catch (error) {
      console.error("Failed to update session with conversation:", error);
      throw error;
    }
  }

  async clearSessionMemory(tenantId: string, sessionId: string): Promise<void> {
    try {
      const key = this.getSessionKey(tenantId, sessionId);
      await this.kv.delete(key);
    } catch (error) {
      console.error(
        `Error clearing session memory for ${tenantId}:${sessionId}:`,
        error
      );
      throw error;
    }
  }

  async getEmailSessionMemory(
    tenantId: string,
    sessionId: string
  ): Promise<SessionMemory | null> {
    try {
      const key = this.getEmailSessionKey(tenantId, sessionId);
      const data = await this.kv.get(key, "text");
      if (!data) return null;

      const sessionMemory = JSON.parse(data) as SessionMemory;

      // Filter messages to only include those from the last 4 hours
      const filteredMemory = this.filterRecentMessages(sessionMemory);

      return filteredMemory;
    } catch (error) {
      console.error(
        `Error getting email session memory for ${tenantId}:${sessionId}:`,
        error
      );
      return null;
    }
  }

  async saveEmailSessionMemory(
    tenantId: string,
    sessionId: string,
    memory: SessionMemory
  ): Promise<void> {
    try {
      const key = this.getEmailSessionKey(tenantId, sessionId);

      // Apply context window limit
      if (memory.messages.length > this.contextWindowLength) {
        memory.messages = memory.messages.slice(-this.contextWindowLength);
      }

      memory.updatedAt = new Date().toISOString();

      await this.kv.put(key, JSON.stringify(memory), {
        expirationTtl: 86400 * 7, // 7 days expiration
      });
    } catch (error) {
      console.error(
        `Error saving email session memory for ${tenantId}:${sessionId}:`,
        error
      );
      throw error;
    }
  }

  async updateEmailSessionWithConversation(
    tenantId: string,
    sessionId: string,
    userMessage: string,
    assistantResponse: string
  ): Promise<void> {
    try {
      // Get existing email session memory or create new one
      let emailSessionMemory = await this.getEmailSessionMemory(tenantId, sessionId);
      if (!emailSessionMemory) {
        emailSessionMemory = {
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }

      // Add user message to memory
      emailSessionMemory.messages.push({
        role: "user",
        content: userMessage,
        timestamp: Date.now(),
      });

      // Add assistant response to memory
      emailSessionMemory.messages.push({
        role: "assistant",
        content: assistantResponse,
        timestamp: Date.now(),
      });

      // Save updated email session memory
      await this.saveEmailSessionMemory(tenantId, sessionId, emailSessionMemory);
    } catch (error) {
      console.error("Failed to update email session with conversation:", error);
      throw error;
    }
  }

  async clearEmailSessionMemory({
    tenantId,
    sessionId,
  }: {
    tenantId: string;
    sessionId: string;
  }): Promise<void> {
    try {
      const key = this.getEmailSessionKey(tenantId, sessionId);
      await this.kv.delete(key);
    } catch (error) {
      console.error(
        `Error clearing email session memory for ${tenantId}:${sessionId}:`,
        error
      );
      throw error;
    }
  }
}
