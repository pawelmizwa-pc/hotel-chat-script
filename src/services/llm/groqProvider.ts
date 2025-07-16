import Groq from "groq-sdk";
import { BaseLLMProvider } from "./baseLLMProvider";
import {
  Env,
  ChatMessage,
  LLMCompletionOptions,
  LLMCompletionResponse,
} from "../../types";

export class GroqProvider extends BaseLLMProvider {
  readonly type = "groq" as const;

  private groq: Groq;
  private defaultApiKey: string;

  constructor(env: Env) {
    super();
    this.defaultApiKey = env.GROQ_API_KEY || "";
    this.groq = new Groq({
      apiKey: this.defaultApiKey,
    });
  }

  setTenantApiKey(apiKey: string | undefined): void {
    super.setTenantApiKey(apiKey);
    // Reinitialize client with the new API key
    const keyToUse = this.getApiKey(this.defaultApiKey);
    this.groq = new Groq({
      apiKey: keyToUse,
    });
  }

  isAvailable(): boolean {
    const keyToUse = this.getApiKey(this.defaultApiKey);
    return !!keyToUse;
  }

  protected getDefaultOptions() {
    return {
      model: "llama-3.1-70b-versatile",
      temperature: 0.7,
      maxTokens: 1000,
    };
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

    const groqMessages = this.normalizeMessages(messages);

    try {
      const response = await this.groq.chat.completions.create({
        model,
        messages: groqMessages,
        temperature,
        max_tokens: maxTokens,
      });

      const choice = response.choices[0];
      if (!choice?.message?.content) {
        throw new Error("No content in Groq response");
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
      console.error("Groq completion error:", error);
      throw error;
    }
  }

  getClient(): Groq {
    return this.groq;
  }
}
