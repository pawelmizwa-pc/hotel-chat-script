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
  readonly supportedModels = [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4.1",
    "gpt-4.1-mini",
  ];

  private openai: OpenAI;
  private apiKey: string;

  constructor(env: Env) {
    super();
    this.apiKey = env.OPENAI_API_KEY;
    this.openai = new OpenAI({
      apiKey: this.apiKey,
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
