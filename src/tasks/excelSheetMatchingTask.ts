import { LLMService } from "../services/llm/llmService";
import { LangfuseService } from "../services/langfuse";
import { ChatMessage, LangfusePrompt, SessionMemory } from "../types";
import { LangfuseTraceClient } from "langfuse";
import { parseLLMResult } from "../utils/llmResultParser";
import { TaskLLMConfig } from "../config/llmConfig";
import { validateMessagesForAnthropic } from "../utils/messageValidator";
import { formatConversationHistory } from "../utils/format";
import { convertToDetailedUsage, logUsageDetails } from "../utils/usageTracker";

export interface ExcelSheetMatchingInput {
  userMessage: string;
  excelConfig: string;
  sessionId: string;
  excelPrompt: LangfusePrompt | null;
  llmConfig: TaskLLMConfig;
  trace?: LangfuseTraceClient;
  sessionHistory: SessionMemory;
}

export interface ExcelSheetMatchingOutput {
  content: string;
  recommendedSheets: Array<{
    sheet_name: string;
    relevance_score: number;
  }>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export class ExcelSheetMatchingTask {
  private llmService: LLMService;
  private langfuseService: LangfuseService;

  constructor(llmService: LLMService, langfuseService: LangfuseService) {
    this.llmService = llmService;
    this.langfuseService = langfuseService;
  }

  private parseExcelSheets(
    content: string,
    generation?: any
  ): Array<{
    sheet_name: string;
    relevance_score: number;
  }> {
    interface ExcelSheetsResponse {
      recommended_sheets?: Array<{
        sheet_name: string;
        relevance_score: number;
      }>;
    }

    const fallback: ExcelSheetsResponse = {
      recommended_sheets: [],
    };

    const sheetsData = parseLLMResult<ExcelSheetsResponse>(
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
                  task: "ExcelSheetMatchingTask",
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

    if (
      sheetsData.recommended_sheets &&
      Array.isArray(sheetsData.recommended_sheets)
    ) {
      return sheetsData.recommended_sheets;
    }

    return [];
  }

  async execute(
    input: ExcelSheetMatchingInput
  ): Promise<ExcelSheetMatchingOutput> {
    // Prepare messages for LLM call
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: formatConversationHistory(input.sessionHistory),
        timestamp: Date.now(),
      },
      {
        role: "system",
        content:
          input.excelPrompt?.prompt ||
          "Find most relevant sheets for the user message.",
        timestamp: Date.now(),
      },
      {
        role: "system",
        content: input.excelConfig,
        timestamp: Date.now(),
      },
      {
        role: "user",
        content: `Find most relevant sheets for the following message: ${input.userMessage}`,
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
          "excel-sheet-matching-task",
          {
            messages: validatedMessages,
          },
          llmConfig.model
        )
      : null;

    // Call LLM service
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
              task: "ExcelSheetMatchingTask",
              model: llmConfig.model,
              provider: llmConfig.provider,
              timestamp: new Date().toISOString(),
            },
          },
        });
      }
      throw error;
    }

    // Parse recommended sheets from the response
    const recommendedSheets = this.parseExcelSheets(
      response.content,
      generation
    );

    const result = {
      content: response.content,
      recommendedSheets,
      usage: response.usage,
    };

    // End generation with detailed usage tracking
    if (generation) {
      const detailedUsage = convertToDetailedUsage(
        result.usage,
        response.model,
        response.provider
      );

      if (detailedUsage) {
        logUsageDetails(
          "ExcelSheetMatchingTask",
          detailedUsage,
          response.model
        );
        this.langfuseService.endGenerationWithUsage(
          generation,
          result.content,
          detailedUsage
        );
      } else {
        generation.end({ output: result.content });
      }
    }

    return result;
  }
}
