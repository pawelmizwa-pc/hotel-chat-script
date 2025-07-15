import { LLMProvider, LLMCompletionOptions, ChatMessage } from "../../types";

export abstract class BaseLLMProvider implements LLMProvider {
  abstract readonly type: string;
  protected tenantApiKey?: string;

  /**
   * Set tenant-specific API key
   */
  setTenantApiKey(apiKey: string | undefined): void {
    this.tenantApiKey = apiKey;
  }

  /**
   * Get the API key to use (tenant-specific if available, otherwise default)
   */
  protected getApiKey(defaultKey: string): string {
    return this.tenantApiKey || defaultKey;
  }

  abstract createCompletion(
    messages: ChatMessage[],
    options?: LLMCompletionOptions
  ): Promise<any>;

  abstract isAvailable(): boolean;

  protected getDefaultOptions() {
    return {
      model: "gpt-3.5-turbo",
      temperature: 0.7,
      maxTokens: 1000,
    };
  }

  protected normalizeMessages(messages: ChatMessage[]) {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }
}
