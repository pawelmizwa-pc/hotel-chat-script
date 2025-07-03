import OpenAI from "openai";
import { Env, ChatMessage } from "../types";

export class OpenAIService {
  private openai: OpenAI;
  private env: Env;

  constructor(env: Env) {
    this.env = env;

    this.openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
  }

  /**
   * Create a chat completion
   * @param messages Array of chat messages
   * @param options Completion options
   * @returns Promise with the completion response
   */
  async createCompletion(
    messages: ChatMessage[],
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): Promise<{
    content: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    model: string;
    finishReason: string | null;
  }> {
    const {
      model = "gpt-4o-mini",
      temperature = 0,
      maxTokens = 1000,
    } = options;

    // Convert ChatMessage[] to OpenAI format
    const openaiMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

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
      };
    } catch (error) {
      console.error("OpenAI completion error:", error);
      throw error;
    }
  }

  /**
   * Get the underlying OpenAI client (for use with observeOpenAI)
   * @returns OpenAI client instance
   */
  getClient(): OpenAI {
    return this.openai;
  }
}
