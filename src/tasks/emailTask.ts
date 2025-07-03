import { LangfuseService } from "../services/langfuse";
import { OpenAIService } from "../services/openaiService";
import { ChatMessage, LangfusePrompt } from "../types";
import { createExcelMessage } from "../constants";
import { observeOpenAI } from "langfuse";

export interface EmailTaskInput {
  userMessage: string;
  firstCallOutput: string;
  excelData: string;
  emailToolPrompt: LangfusePrompt | null;
  knowledgeBasePrompt: LangfusePrompt | null;
  sessionId: string;
}

export interface EmailTaskOutput {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  traceId?: string;
}

export class EmailTask {
  private langfuseService: LangfuseService;
  private openaiService: OpenAIService;

  constructor(langfuseService: LangfuseService, openaiService: OpenAIService) {
    this.langfuseService = langfuseService;
    this.openaiService = openaiService;
  }

  async execute(input: EmailTaskInput): Promise<EmailTaskOutput> {
    // Prepare messages for OpenAI call
    const messages: ChatMessage[] = [
      // System prompt from knowledge-base-tool
      {
        role: "system",
        content:
          input.emailToolPrompt?.prompt || "You are a helpful hotel assistant.",
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
        content: `This is first call output:\n${input.firstCallOutput}`,
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
        generationName: "email-generation",
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
