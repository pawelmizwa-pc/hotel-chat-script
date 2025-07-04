import { LangfuseService } from "../services/langfuse";
import { OpenAIService } from "../services/openaiService";
import { ChatMessage, LangfusePrompt, SessionMemory } from "../types";
import { createExcelMessage } from "../constants";
import { LangfuseTraceClient } from "langfuse";

export interface EmailTaskInput {
  userMessage: string;
  firstCallOutput: string;
  excelData: string;
  emailToolPrompt: LangfusePrompt | null;
  knowledgeBasePrompt: LangfusePrompt | null;
  sessionHistory: SessionMemory;
  sessionId: string;
  trace?: LangfuseTraceClient; // Langfuse trace object
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
      {
        role: "user",
        content: input.userMessage,
        timestamp: Date.now(),
      },
      {
        role: "system",
        content:
          input.emailToolPrompt?.prompt || "You are a helpful hotel assistant.",
        timestamp: Date.now(),
      },
      {
        role: "system",
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
      ...input.sessionHistory.messages
        .map((msg: ChatMessage) => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
        }))
        .reverse(),
    ];

    // Create generation for this LLM call
    const generation = input.trace
      ? this.langfuseService.createGeneration(
          input.trace,
          "email-task",
          { messages },
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
