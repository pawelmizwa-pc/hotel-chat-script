import { LangfuseService } from "../services/langfuse";
import { OpenAIService } from "../services/openaiService";
import { ChatMessage, SessionMemory, LangfusePrompt } from "../types";
import { createExcelMessage } from "../constants";
import { observeOpenAI } from "langfuse";

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

    // Create OpenAI client with Langfuse prompt linking
    const baseOpenAI = this.openaiService.getClient();

    // Use observeOpenAI wrapper
    const openaiWithPrompt = observeOpenAI(baseOpenAI, {
      generationName: "guest-service-generation",
      sessionId: input.sessionId,
      userId: input.sessionId,
    });

    // Call OpenAI - observeOpenAI automatically creates trace and generation
    const response = await openaiWithPrompt.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      temperature: 0,
      max_tokens: 1000,
    });

    // Finalize and send to Langfuse
    await openaiWithPrompt.flushAsync();
    await this.langfuseService.flush();

    return {
      content: response.choices[0].message.content || "",
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
      traceId: input.sessionId, // Use sessionId as trace identifier
    };
  }
}
