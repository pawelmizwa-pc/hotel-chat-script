import {
  ChatMessage,
  LLMProvider,
  LLMProviderType,
  LLMCompletionOptions,
  LLMCompletionResponse,
} from "../../types";

export abstract class BaseLLMProvider implements LLMProvider {
  abstract readonly type: LLMProviderType;

  abstract createCompletion(
    messages: ChatMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMCompletionResponse>;

  abstract isAvailable(): boolean;

  protected normalizeMessages(messages: ChatMessage[]): any[] {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  protected getDefaultOptions(): Required<LLMCompletionOptions> {
    return {
      model: "gpt-4o-mini", // Default fallback model
      temperature: 0,
      maxTokens: 1000,
      stream: false,
    };
  }
}
