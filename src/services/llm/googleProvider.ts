import { GoogleGenerativeAI } from "@google/generative-ai";
import { BaseLLMProvider } from "./baseLLMProvider";
import {
  Env,
  ChatMessage,
  LLMCompletionOptions,
  LLMCompletionResponse,
} from "../../types";

export class GoogleProvider extends BaseLLMProvider {
  readonly type = "google" as const;

  private genAI: GoogleGenerativeAI | null = null;
  private apiKey: string | undefined;

  constructor(env: Env) {
    super();
    this.apiKey = env.GOOGLE_AI_API_KEY;
    if (this.apiKey) {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey && !!this.genAI;
  }

  async createCompletion(
    messages: ChatMessage[],
    options: LLMCompletionOptions = {}
  ): Promise<LLMCompletionResponse> {
    if (!this.genAI) {
      throw new Error("Google AI not available - API key not provided");
    }

    const defaultOptions = this.getDefaultOptions();
    const {
      model = defaultOptions.model,
      temperature = defaultOptions.temperature,
      maxTokens = defaultOptions.maxTokens,
    } = options;

    try {
      const genModel = this.genAI.getGenerativeModel({ model });

      // Convert messages to Google's format
      const history = messages.slice(0, -1).map((msg) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      }));

      const chat = genModel.startChat({
        history,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
      });

      const lastMessage = messages[messages.length - 1];
      const result = await chat.sendMessage(lastMessage.content);
      const response = await result.response;

      if (!response.text()) {
        throw new Error("No content in Google AI response");
      }

      // Google doesn't provide detailed usage stats in the same way
      const usage = response.usageMetadata
        ? {
            promptTokens: response.usageMetadata.promptTokenCount || 0,
            completionTokens: response.usageMetadata.candidatesTokenCount || 0,
            totalTokens: response.usageMetadata.totalTokenCount || 0,
          }
        : undefined;

      return {
        content: response.text(),
        usage,
        model,
        finishReason: response.candidates?.[0]?.finishReason || null,
        provider: this.type,
      };
    } catch (error) {
      console.error("Google AI completion error:", error);
      throw error;
    }
  }
}
