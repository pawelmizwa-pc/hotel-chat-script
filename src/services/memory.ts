import { Env, SessionMemory } from "../types";

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
      const data = await this.kv.get(key, "text");
      if (!data) return null;
      return JSON.parse(data) as SessionMemory;
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
}
