import { LangfuseService } from "../services/langfuse";
import { LLMService } from "../services/llm";
import { ChatMessage, SessionMemory, LangfusePrompt } from "../types";
import { TenantConfig } from "./dataCollectionTask";
import { LangfuseTraceClient } from "langfuse";
import { parseLLMResult } from "../utils/llmResultParser";
import { getLLMConfig } from "../config/llmConfig";

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
  private llmService: LLMService;

  constructor(langfuseService: LangfuseService, llmService: LLMService) {
    this.langfuseService = langfuseService;
    this.llmService = llmService;
  }

  private parseGuestServiceResponse(
    content: string,
    generation?: any
  ): {
    text: string;
    isDuringServiceRequest: boolean;
  } {
    interface GuestServiceResponse {
      text?: string;
      isDuringServiceRequest?: boolean;
    }

    const fallback: GuestServiceResponse = {
      text: content, // Use raw content as fallback
      isDuringServiceRequest: false,
    };

    const responseData = parseLLMResult<GuestServiceResponse>(
      content,
      fallback,
      (error, content) => {
        // Log parsing error to Langfuse generation if available
        if (generation) {
          try {
            generation.update({
              metadata: {
                parsingError: {
                  message: error.message,
                  task: "GuestServiceTask",
                  originalContent: content.substring(0, 500), // Truncate for logging
                  timestamp: new Date().toISOString(),
                },
              },
            });
          } catch (logError) {
            console.warn("Failed to log parsing error to Langfuse:", logError);
          }
        }
      }
    );

    // Validate that we have proper values
    if (
      responseData.text &&
      typeof responseData.isDuringServiceRequest === "boolean"
    ) {
      return {
        text: responseData.text,
        isDuringServiceRequest: responseData.isDuringServiceRequest,
      };
    }

    // Return fallback if validation fails
    return {
      text: content,
      isDuringServiceRequest: false,
    };
  }

  async execute(input: GuestServiceTaskInput): Promise<GuestServiceTaskOutput> {
    // Prepare messages for OpenAI call
    const messages: ChatMessage[] = [
      {
        role: "user",
        content: input.userMessage,
        timestamp: Date.now(),
      },
      ...input.sessionHistory.messages.reverse(),
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
        content: input.excelData,
        timestamp: Date.now(),
      },
      {
        role: "assistant",
        content: `User provided the following information: ${
          input.userMessage
        }\n${input.sessionHistory.messages
          .filter((msg) => msg.role === "user")
          .map((msg) => msg.content)
          .join("\n")}`,
        timestamp: Date.now(),
      },
    ];

    // Get LLM configuration for this task
    const llmConfig = getLLMConfig("guestServiceTask");

    // Create generation for this LLM call
    const generation = input.trace
      ? this.langfuseService.createGeneration(
          input.trace,
          "guest-service-task",
          {
            messages,
          },
          llmConfig.model
        )
      : null;

    // Call LLM service with new architecture
    const response = await this.llmService.createCompletion(messages, {
      model: llmConfig.model,
      provider: llmConfig.provider,
      temperature: llmConfig.temperature,
      maxTokens: llmConfig.maxTokens,
    });

    const content = response.content;

    // Parse the JSON response to extract text and isDuringServiceRequest
    const parsedResponse = this.parseGuestServiceResponse(content, generation);

    const result = {
      content,
      text: parsedResponse.text,
      isDuringServiceRequest: parsedResponse.isDuringServiceRequest,
      usage: response.usage || {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
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
