import { LangfuseService } from "../services/langfuse";
import { OpenAIService } from "../services/openaiService";
import { ChatMessage, LangfusePrompt, SessionMemory } from "../types";
import { createExcelMessage } from "../constants";
import { observeOpenAI } from "langfuse";

export interface ButtonsTaskInput {
  userMessage: string;
  firstCallOutput: string;
  excelData: string;
  buttonsPrompt: LangfusePrompt | null;
  knowledgeBasePrompt: LangfusePrompt | null;
  sessionId: string;
}

export interface ButtonsTaskOutput {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  traceId?: string;
}

export class ButtonsTask {
  private langfuseService: LangfuseService;
  private openaiService: OpenAIService;

  constructor(langfuseService: LangfuseService, openaiService: OpenAIService) {
    this.langfuseService = langfuseService;
    this.openaiService = openaiService;
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
      // Assistant messages (excel + first call output)
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
        content: input.firstCallOutput,
        timestamp: Date.now(),
      },
      // User input
      {
        role: "user",
        content: input.userMessage,
        timestamp: Date.now(),
      },
    ];

    // Create OpenAI client with Langfuse observability
    const baseOpenAI = this.openaiService.getClient();

    // Use our configured observeOpenAI wrapper
    const openaiWithPrompt = this.langfuseService.createObservedOpenAI(
      baseOpenAI,
      {
        generationName: "buttons-generation",
        sessionId: input.sessionId,
        userId: input.sessionId,
      }
    );

    // Call OpenAI - observeOpenAI automatically creates trace and generation
    const response = await openaiWithPrompt.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      temperature: 0.3,
      max_tokens: 1000,
    });

    // Finalize and send to Langfuse
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
