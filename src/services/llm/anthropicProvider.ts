import Anthropic from "@anthropic-ai/sdk";
import { BaseLLMProvider } from "./baseLLMProvider";
import {
  Env,
  ChatMessage,
  LLMCompletionOptions,
  LLMCompletionResponse,
} from "../../types";

export class AnthropicProvider extends BaseLLMProvider {
  readonly type = "anthropic" as const;

  private anthropic: Anthropic | null = null;
  private defaultApiKey: string | undefined;

  constructor(env: Env) {
    super();
    this.defaultApiKey = env.ANTHROPIC_API_KEY;
    this.initializeClient();
  }

  private initializeClient(): void {
    const keyToUse = this.getApiKey(this.defaultApiKey || "");
    if (keyToUse) {
      this.anthropic = new Anthropic({
        apiKey: keyToUse,
      });
    } else {
      this.anthropic = null;
    }
  }

  setTenantApiKey(apiKey: string | undefined): void {
    super.setTenantApiKey(apiKey);
    this.initializeClient();
  }

  isAvailable(): boolean {
    const keyToUse = this.getApiKey(this.defaultApiKey || "");
    return !!keyToUse && !!this.anthropic;
  }

  async createCompletion(
    messages: ChatMessage[],
    options: LLMCompletionOptions = {}
  ): Promise<LLMCompletionResponse> {
    if (!this.anthropic) {
      throw new Error("Anthropic not available - API key not provided");
    }

    const defaultOptions = this.getDefaultOptions();
    const {
      model = defaultOptions.model,
      temperature = defaultOptions.temperature,
      maxTokens = options.maxTokens || 5000,
    } = options;

    try {
      // Anthropic requires system messages to be separate
      const systemMessages = messages.filter((msg) => msg.role === "system");
      const conversationMessages = messages.filter(
        (msg) => msg.role !== "system"
      );

      const systemPrompt =
        systemMessages.length > 0
          ? systemMessages.map((msg) => msg.content).join("\n")
          : undefined;

      const anthropicMessages = conversationMessages.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      }));

      const response = await this.anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: anthropicMessages,
      });

      const content = response.content[0];
      if (content.type !== "text") {
        throw new Error("Unexpected response type from Anthropic");
      }

      return {
        content: content.text,
        usage: response.usage
          ? {
              promptTokens: response.usage.input_tokens,
              completionTokens: response.usage.output_tokens,
              totalTokens:
                response.usage.input_tokens + response.usage.output_tokens,
            }
          : undefined,
        model: response.model,
        finishReason: response.stop_reason,
        provider: this.type,
      };
    } catch (error) {
      console.error("Anthropic completion error:", error);
      throw error;
    }
  }
}
