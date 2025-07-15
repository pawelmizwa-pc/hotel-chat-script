import { LangfuseService } from "../services/langfuse";
import { LLMService } from "../services/llm";
import { ChatMessage, SessionMemory, LangfusePrompt } from "../types";
import { TenantConfig } from "./dataCollectionTask";
import { LangfuseTraceClient } from "langfuse";
import { TaskLLMConfig } from "../config/llmConfig";
import { validateMessagesForAnthropic } from "../utils/messageValidator";

export interface GuestServiceTaskInput {
  userMessage: string;
  sessionHistory: SessionMemory;
  excelData: string;
  guestServicePrompt: LangfusePrompt | null;
  tenantConfig: TenantConfig | null;
  sessionId: string;
  llmConfig: TaskLLMConfig;
  trace?: LangfuseTraceClient; // Langfuse trace object
}

export interface GuestServiceTaskOutput {
  content: string;
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
        role: "system",
        content: input.tenantConfig?.["general-prompt-config"] || "",
        timestamp: Date.now(),
      },
      {
        role: "system",
        content: input.excelData,
        timestamp: Date.now(),
      },
      ...input.sessionHistory.messages,
      {
        role: "user",
        content: input.userMessage,
        timestamp: Date.now(),
      },
    ];

    // Validate messages for Anthropic provider
    const validatedMessages = validateMessagesForAnthropic(messages);

    // Use provided LLM configuration
    const llmConfig = input.llmConfig;

    // Create generation for this LLM call
    const generation = input.trace
      ? this.langfuseService.createGeneration(
          input.trace,
          "guest-service-task",
          {
            messages: validatedMessages,
          },
          llmConfig.model
        )
      : null;

    // Call LLM service with new architecture
    let response;
    try {
      response = await this.llmService.createCompletion(validatedMessages, {
        model: llmConfig.model,
        provider: llmConfig.provider,
        temperature: llmConfig.temperature,
        maxTokens: llmConfig.maxTokens,
      });
    } catch (error) {
      // Log LLM failure to Langfuse generation
      if (generation) {
        generation.update({
          metadata: {
            llmError: {
              message: error instanceof Error ? error.message : String(error),
              task: "GuestServiceTask",
              model: llmConfig.model,
              provider: llmConfig.provider,
              timestamp: new Date().toISOString(),
            },
          },
        });
      }
      throw error;
    }

    const content = response.content;

    const result = {
      content,
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
