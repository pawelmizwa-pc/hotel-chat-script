import { LangfuseService } from "../services/langfuse";
import { OpenAIService } from "../services/openaiService";
import { ChatMessage, SessionMemory, LangfusePrompt } from "../types";
import { TenantConfig } from "./dataCollectionTask";
import { createExcelMessage } from "../constants";
import { LangfuseTraceClient } from "langfuse";

export interface GuestServiceTaskInput {
  userMessage: string;
  sessionHistory: SessionMemory;
  excelData: string;
  guestServicePrompt: LangfusePrompt | null;
  excelConfig: string | null;
  tenantConfig: TenantConfig | null;
  sessionId: string;
  trace?: LangfuseTraceClient; // Langfuse trace object
}

export interface GuestServiceTaskOutput {
  content: string;
  text: string; // Parsed text from JSON response
  isDuringServiceRequest: boolean; // Parsed boolean from JSON response
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  traceId?: string;
}

export class GuestServiceTask {
  private langfuseService: LangfuseService;
  private openaiService: OpenAIService;

  constructor(langfuseService: LangfuseService, openaiService: OpenAIService) {
    this.langfuseService = langfuseService;
    this.openaiService = openaiService;
  }

  private parseGuestServiceResponse(content: string): {
    text: string;
    isDuringServiceRequest: boolean;
  } {
    try {
      // Clean the content by removing markdown code blocks and extra whitespace
      let cleanContent = content.trim();

      // Remove markdown code blocks if present
      const jsonMatch = cleanContent.match(
        /```(?:json)?\s*(\{[\s\S]*?\})\s*```/
      );
      if (jsonMatch) {
        cleanContent = jsonMatch[1];
      }

      // Extract JSON if it's wrapped in other text
      const jsonObjectMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (jsonObjectMatch) {
        cleanContent = jsonObjectMatch[0];
      }

      const responseData = JSON.parse(cleanContent);
      if (
        responseData.text &&
        typeof responseData.isDuringServiceRequest === "boolean"
      ) {
        return {
          text: responseData.text,
          isDuringServiceRequest: responseData.isDuringServiceRequest,
        };
      }
    } catch (error) {
      console.warn("Failed to parse guest service JSON response:", error);
      console.warn("Original content:", content);
      return {
        text: content,
        isDuringServiceRequest: true,
      };
    }

    // Fallback: if parsing fails, use the raw content as text and assume no service request
    return {
      text: content,
      isDuringServiceRequest: false,
    };
  }

  async execute(input: GuestServiceTaskInput): Promise<GuestServiceTaskOutput> {
    // Prepare messages for OpenAI call
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          input.guestServicePrompt?.prompt ||
          "You are a helpful hotel assistant.",
        timestamp: Date.now(),
      },
      {
        role: "assistant",
        content: input.tenantConfig?.["general-prompt-config"] || "",
        timestamp: Date.now(),
      },
      {
        role: "system",
        content: createExcelMessage(input.excelConfig || "", input.excelData),
        timestamp: Date.now(),
      },
      {
        role: "user",
        content: input.userMessage,
        timestamp: Date.now(),
      },
      {
        role: "assistant",
        content: `Session history, used as context for isDuringServiceRequest field: ${JSON.stringify(
          input.sessionHistory.messages
        )}`,
        timestamp: Date.now(),
      },
    ];

    // Create generation for this LLM call
    const generation = input.trace
      ? this.langfuseService.createGeneration(
          input.trace,
          "guest-service-task",
          {
            messages,
          },
          "gpt-4o"
        )
      : null;

    // Call OpenAI directly
    const response = await this.openaiService
      .getClient()
      .chat.completions.create({
        model: "gpt-4o",
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      });

    const content = response.choices[0].message.content || "";

    // Parse the JSON response to extract text and isDuringServiceRequest
    const parsedResponse = this.parseGuestServiceResponse(content);

    const result = {
      content,
      text: parsedResponse.text,
      isDuringServiceRequest: parsedResponse.isDuringServiceRequest,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
      traceId: input.sessionId,
    };

    // End generation with output and usage
    if (generation) {
      generation.end({
        output: result.content,
        usage: result.usage,
      });
    }

    return result;
  }
}
