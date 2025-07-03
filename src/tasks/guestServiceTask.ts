import { LangfuseService } from "../services/langfuse";
import { OpenAIService } from "../services/openaiService";
import { ChatMessage, SessionMemory, LangfusePrompt } from "../types";
import { createExcelMessage } from "../constants";
import { LangfuseTraceClient } from "langfuse";

export interface GuestServiceTaskInput {
  userMessage: string;
  sessionHistory: SessionMemory;
  excelData: string;
  guestServicePrompt: LangfusePrompt | null;
  knowledgeBasePrompt: LangfusePrompt | null;
  sessionId: string;
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
  private openaiService: OpenAIService;

  constructor(langfuseService: LangfuseService, openaiService: OpenAIService) {
    this.langfuseService = langfuseService;
    this.openaiService = openaiService;
  }

  async execute(input: GuestServiceTaskInput): Promise<GuestServiceTaskOutput> {
    // Prepare messages for OpenAI call
    const messages: ChatMessage[] = [
      // System prompt from guest-service
      {
        role: "system",
        content:
          input.guestServicePrompt?.prompt ||
          "You are a helpful hotel assistant.",
        timestamp: Date.now(),
      },
      // Assistant messages (excel + history)
      {
        role: "assistant",
        content: createExcelMessage(
          input.knowledgeBasePrompt?.prompt || "",
          input.excelData
        ),
        timestamp: Date.now(),
      },
      // User input
      {
        role: "user",
        content: input.userMessage,
        timestamp: Date.now(),
      },
      ...input.sessionHistory.messages,
    ];

    // Create generation for this LLM call
    const generation = input.trace
      ? this.langfuseService.createGeneration(
          input.trace,
          "guest-service-task",
          {
            messages,
          },
          "gpt-4.1-mini"
        )
      : null;

    // Call OpenAI directly
    const response = await this.openaiService
      .getClient()
      .chat.completions.create({
        model: "gpt-4.1-mini",
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: 0,
        max_tokens: 1000,
      });

    const result = {
      content: response.choices[0].message.content || "",
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
