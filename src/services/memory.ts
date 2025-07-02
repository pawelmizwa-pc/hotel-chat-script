import { Env, SessionMemory, ChatMessage } from "../types";

export class MemoryService {
  private kv: KVNamespace;
  private contextWindowLength: number;

  constructor(env: Env) {
    this.kv = env.CHAT_SESSIONS;
    this.contextWindowLength = parseInt(env.CONTEXT_WINDOW_LENGTH) || 15;
  }

  private getSessionKey(sessionId: string): string {
    return `session:${sessionId}`;
  }

  async getSessionMemory(sessionId: string): Promise<SessionMemory | null> {
    try {
      const key = this.getSessionKey(sessionId);
      const data = await this.kv.get(key, "json");
      return data as SessionMemory | null;
    } catch (error) {
      console.error(`Error getting session memory for ${sessionId}:`, error);
      return null;
    }
  }

  async saveSessionMemory(
    sessionId: string,
    memory: SessionMemory
  ): Promise<void> {
    try {
      const key = this.getSessionKey(sessionId);

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

  async addMessage(sessionId: string, message: ChatMessage): Promise<void> {
    let memory = await this.getSessionMemory(sessionId);

    if (!memory) {
      memory = {
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    memory.messages.push({
      ...message,
      timestamp: Date.now(),
    });

    await this.saveSessionMemory(sessionId, memory);
  }

  async getConversationHistory(sessionId: string): Promise<ChatMessage[]> {
    const memory = await this.getSessionMemory(sessionId);
    return memory?.messages || [];
  }

  async clearSession(sessionId: string): Promise<void> {
    try {
      const key = this.getSessionKey(sessionId);
      await this.kv.delete(key);
    } catch (error) {
      console.error(`Error clearing session ${sessionId}:`, error);
      throw error;
    }
  }

  formatMessagesForLangChain(
    messages: ChatMessage[]
  ): Array<{ role: string; content: string }> {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }
}
