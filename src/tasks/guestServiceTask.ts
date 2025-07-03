import { LangfuseService } from "../services/langfuse";
import { OpenAIService } from "../services/openaiService";
import { Env, ChatMessage, SessionMemory, LangfusePrompt } from "../types";
import { createExcelMessage } from "../constants";

export interface GuestServiceTaskInput {
  userMessage: string;
  sessionHistory: SessionMemory;
  excelData: string;
  guestServicePrompt: LangfusePrompt | null;
  knowledgeBasePrompt: LangfusePrompt | null;
  sessionId: string;
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

  constructor(env: Env) {
    this.langfuseService = new LangfuseService(env);
    this.openaiService = new OpenAIService(env);
  }

  async execute(input: GuestServiceTaskInput): Promise<GuestServiceTaskOutput> {
    // Create Langfuse trace
    const trace = this.langfuseService.createTrace(
      input.sessionId,
      input.sessionId
    );

    // Create generation for tracking
    const generation = this.langfuseService.createGeneration(
      trace,
      "guest-service-call",
      [],
      "gpt-4o-mini"
    );

    try {
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
        {
          role: "assistant",
          content: `Conversation history:\n${JSON.stringify(
            input.sessionHistory.messages
          )}`,
          timestamp: Date.now(),
        },
        // User input
        {
          role: "user",
          content: input.userMessage,
          timestamp: Date.now(),
        },
      ];

      // Make OpenAI call with observability
      const observedOpenAI = this.langfuseService.observeOpenAI(
        this.openaiService.getClient(),
        input.sessionId,
        input.sessionId
      );

      // Create completion
      const response = await this.openaiService.createCompletion(messages, {
        model: "gpt-4o-mini",
        temperature: 0,
        maxTokens: 1000,
      });

      // End generation with response
      this.langfuseService.endGeneration(
        generation,
        response.content,
        response.usage
      );

      // End trace
      this.langfuseService.endTrace(trace, response.content, {
        task: "guest-service-call",
        model: "gpt-4o-mini",
        success: true,
      });

      return {
        content: response.content,
        usage: response.usage,
        traceId: trace.id,
      };
    } catch (error) {
      // End generation with error
      generation.end({
        output: null,
        endTime: new Date(),
        level: "ERROR",
        statusMessage: error instanceof Error ? error.message : "Unknown error",
      });

      // End trace with error
      this.langfuseService.endTrace(trace, null, {
        task: "guest-service-call",
        error: error instanceof Error ? error.message : "Unknown error",
        success: false,
      });

      console.error("Error in guest service task:", error);
      throw error;
    }
  }
}
