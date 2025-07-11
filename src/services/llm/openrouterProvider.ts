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
  readonly supportedModels = [
    "deepseek/deepseek-r1-distill-llama-70b:free",
    "deepseek/deepseek-v3-base:free",
    "deepseek/deepseek-r1-0528-qwen3-8b:free",
    "tngtech/deepseek-r1t2-chimera:free",
  ];

  private openai: OpenAI;
  private apiKey: string;

  constructor(env: Env) {
    super();
    this.apiKey = env.OPENROUTER_API_KEY || "";
    this.openai = new OpenAI({
      apiKey: this.apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://hotel-chat-script.com",
        "X-Title": "Hotel Chat Script",
      },
    });
  }

  isAvailable(): boolean {
    return !!this.apiKey;
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
