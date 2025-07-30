import OpenAI from "openai";
import { BaseLLMProvider } from "./baseLLMProvider";
import {
  Env,
  ChatMessage,
  LLMCompletionOptions,
  LLMCompletionResponse,
} from "../../types";

export class OpenRouterProvider extends BaseLLMProvider {
  readonly type = "openrouter" as const;

  private openai!: OpenAI;
  private defaultApiKey: string;

  constructor(env: Env) {
    super();
    this.defaultApiKey = env.OPENROUTER_API_KEY || "";
    this.initializeClient();
  }

  private initializeClient(): void {
    const keyToUse = this.getApiKey(this.defaultApiKey);
    this.openai = new OpenAI({
      apiKey: keyToUse,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://hotel-chat-script.com",
        "X-Title": "Hotel Chat Script",
      },
    });
  }

  setTenantApiKey(apiKey: string | undefined): void {
    super.setTenantApiKey(apiKey);
    this.initializeClient();
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
      maxTokens = options.maxTokens,
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
        throw new Error("No content in OpenRouter response");
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
      console.error("OpenRouter completion error:", error);
      throw error;
    }
  }

  getClient(): OpenAI {
    return this.openai;
  }
}
