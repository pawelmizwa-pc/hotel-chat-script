import { LangfuseService } from "../services/langfuse";
import { LLMService } from "../services/llm";
import { ChatMessage, LangfusePrompt } from "../types";
import { TenantConfig } from "./dataCollectionTask";
import { LangfuseTraceClient } from "langfuse";
import { parseLLMResult } from "../utils/llmResultParser";
import { getLLMConfig } from "../config/llmConfig";

export interface ButtonsTaskInput {
  userMessage: string;
  firstCallOutput?: string; // Make this optional
  excelData: string;
  buttonsPrompt: LangfusePrompt | null;
  tenantConfig: TenantConfig | null;
  sessionId: string;
  trace?: LangfuseTraceClient; // Langfuse trace object
}

export interface ButtonsTaskOutput {
  content: string;
  buttons: Array<{ type: "postback"; title: string; payload: string }>;
  language: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  traceId?: string;
}

export class ButtonsTask {
  private langfuseService: LangfuseService;
  private llmService: LLMService;

  constructor(langfuseService: LangfuseService, llmService: LLMService) {
    this.langfuseService = langfuseService;
    this.llmService = llmService;
  }

  private parseButtons(
    content: string,
    generation?: any
  ): {
    buttons: Array<{ type: "postback"; title: string; payload: string }>;
    language: string;
  } {
    interface ButtonsResponse {
      result?: Array<{ title: string; payload: string }>;
      language?: string;
    }

    const fallback: ButtonsResponse = {
      result: [],
      language: "en",
    };

    const buttonsData = parseLLMResult<ButtonsResponse>(
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
                  task: "ButtonsTask",
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

    if (buttonsData.result && Array.isArray(buttonsData.result)) {
      return {
        buttons: buttonsData.result.map((item: any) => ({
          type: "postback" as const,
          title: item.title,
          payload: item.payload,
        })),
        language: buttonsData.language || "en",
      };
    }

    return {
      buttons: [],
      language: "en",
    };
  }

  async execute(input: ButtonsTaskInput): Promise<ButtonsTaskOutput> {
    // Prepare messages for OpenAI call
    const messages: ChatMessage[] = [
      // System prompt from buttons
      {
        role: "system",
        content:
          input.buttonsPrompt?.prompt || "You are a helpful hotel assistant.",
        timestamp: Date.now(),
      },
      {
        role: "assistant",
        content: input.tenantConfig?.["buttons-prompt-config"] || "",
        timestamp: Date.now(),
      },
      // Assistant messages (excel data)
      {
        role: "assistant",
        content: input.excelData,
        timestamp: Date.now(),
      },
    ];

    // Only include firstCallOutput if it's provided
    if (input.firstCallOutput) {
      messages.push({
        role: "assistant",
        content: input.firstCallOutput,
        timestamp: Date.now(),
      });
    }

    // User input
    messages.push({
      role: "user",
      content: input.userMessage,
      timestamp: Date.now(),
    });

    // Get LLM configuration for this task
    const llmConfig = getLLMConfig("buttonsTask");

    // Create generation for this LLM call
    const generation = input.trace
      ? this.langfuseService.createGeneration(
          input.trace,
          "buttons-task",
          {
            messages,
          },
          llmConfig.model
        )
      : null;

    // Call LLM service with new architecture
    let response;
    try {
      response = await this.llmService.createCompletion(messages, {
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
              task: "ButtonsTask",
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

    // Parse buttons from the response content
    const buttonsData = this.parseButtons(content, generation);

    const result = {
      content,
      buttons: buttonsData.buttons,
      language: buttonsData.language,
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
