import { LangfuseService } from "../services/langfuse";
import { OpenAIService } from "../services/openaiService";
import { ChatMessage, LangfusePrompt } from "../types";
import { TenantConfig } from "./dataCollectionTask";
import { createExcelMessage } from "../constants";
import { LangfuseTraceClient } from "langfuse";

export interface ButtonsTaskInput {
  userMessage: string;
  firstCallOutput?: string; // Make this optional
  excelData: string;
  buttonsPrompt: LangfusePrompt | null;
  excelConfig: string | null;
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
  private openaiService: OpenAIService;

  constructor(langfuseService: LangfuseService, openaiService: OpenAIService) {
    this.langfuseService = langfuseService;
    this.openaiService = openaiService;
  }

  private parseButtons(content: string): {
    buttons: Array<{ type: "postback"; title: string; payload: string }>;
    language: string;
  } {
    try {
      // Clean the content by removing markdown code blocks and extra whitespace
      let cleanContent = content.trim();

      // Remove markdown code blocks if present
      const jsonMatch = cleanContent.match(
        /```(?:json)?\s*(\{[\s\S]*?\})\s*```/
      );
      if (jsonMatch) {
        cleanContent = jsonMatch[1];
      }

      // Extract JSON if it's wrapped in other text
      const jsonObjectMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (jsonObjectMatch) {
        cleanContent = jsonObjectMatch[0];
      }

      const buttonsData = JSON.parse(cleanContent);
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
    } catch (error) {
      console.warn("Failed to parse buttons from response:", error);
      console.warn("Original content:", content);
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
        content: createExcelMessage(
          input.excelConfig || "",
          input.excelData
        ),
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

    // Create generation for this LLM call
    const generation = input.trace
      ? this.langfuseService.createGeneration(
          input.trace,
          "buttons-task",
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

    const content = response.choices[0].message.content || "";

    // Parse buttons from the response content
    const buttonsData = this.parseButtons(content);

    const result = {
      content,
      buttons: buttonsData.buttons,
      language: buttonsData.language,
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
