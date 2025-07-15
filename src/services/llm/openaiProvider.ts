import OpenAI from "openai";
import { BaseLLMProvider } from "./baseLLMProvider";
import {
  Env,
  ChatMessage,
  LLMCompletionOptions,
  LLMCompletionResponse,
} from "../../types";

export class OpenAIProvider extends BaseLLMProvider {
  readonly type = "openai" as const;

  private openai: OpenAI;
  private defaultApiKey: string;

  constructor(env: Env) {
    super();
    this.defaultApiKey = env.OPENAI_API_KEY;
    this.openai = new OpenAI({
      apiKey: this.defaultApiKey,
    });
  }

  setTenantApiKey(apiKey: string | undefined): void {
    super.setTenantApiKey(apiKey);
    // Reinitialize client with the new API key
    const keyToUse = this.getApiKey(this.defaultApiKey);
    this.openai = new OpenAI({
      apiKey: keyToUse,
    });
  }

  isAvailable(): boolean {
    const keyToUse = this.getApiKey(this.defaultApiKey);
    return !!keyToUse;
  }

  async createCompletion(
    messages: ChatMessage[],
    options: LLMCompletionOptions = {}
  ): Promise<LLMCompletionResponse> {
    const defaultOptions = this.getDefaultOptions();
    const {
      model = defaultOptions.model,
      temperature = defaultOptions.temperature,
      maxTokens = defaultOptions.maxTokens,
    } = options;

    const openaiMessages = this.normalizeMessages(messages);

    try {
      const response = await this.openai.chat.completions.create({
        model,
        messages: openaiMessages,
        temperature,
        max_tokens: maxTokens,
      });

      const choice = response.choices[0];
      if (!choice?.message?.content) {
        throw new Error("No content in OpenAI response");
      }

      return {
        content: choice.message.content,
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
        model: response.model,
        finishReason: choice.finish_reason,
        provider: this.type,
      };
    } catch (error) {
      console.error("OpenAI completion error:", error);
      throw error;
    }
  }

  getClient(): OpenAI {
    return this.openai;
  }
}
