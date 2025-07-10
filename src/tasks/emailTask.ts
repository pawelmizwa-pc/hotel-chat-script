import { LangfuseService } from "../services/langfuse";
import { OpenAIService } from "../services/openaiService";
import { EmailService } from "../services/emailService";
import { ChatMessage, LangfusePrompt, SessionMemory } from "../types";
import { TenantConfig } from "./dataCollectionTask";
import { createExcelMessage } from "../constants";
import { LangfuseTraceClient } from "langfuse";

export interface EmailTaskInput {
  userMessage: string;
  firstCallOutput: string;
  excelData: string;
  emailToolPrompt: LangfusePrompt | null;
  excelConfig: string | null;
  tenantConfig: TenantConfig | null;
  sessionHistory: SessionMemory;
  sessionId: string;
  tenantId?: string;
  detectedLanguage: string;
  trace?: LangfuseTraceClient; // Langfuse trace object
}

export interface EmailTaskOutput {
  content: string;
  emailText: string;
  duringEmailClarification: boolean;
  shouldSendEmail: boolean;
  clarificationText: string;
  emailSent: boolean;
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
  private emailService: EmailService;

  constructor(
    langfuseService: LangfuseService,
    openaiService: OpenAIService,
    emailService: EmailService
  ) {
    this.langfuseService = langfuseService;
    this.openaiService = openaiService;
    this.emailService = emailService;
  }

  private parseEmailResponse(content: string): {
    emailText: string;
    duringEmailClarification: boolean;
    shouldSendEmail: boolean;
    clarificationText: string;
  } {
    try {
      // Clean up markdown formatting from AI response
      let cleanContent = content.trim();

      // Remove markdown code block formatting
      if (
        cleanContent.startsWith("```json\n") ||
        cleanContent.startsWith("```\n")
      ) {
        cleanContent = cleanContent
          .replace(/^```(?:json)?\n/, "")
          .replace(/\n```$/, "");
      }

      // Remove "json" prefix if present
      if (cleanContent.startsWith("json\n")) {
        cleanContent = cleanContent.replace(/^json\n/, "");
      }

      // Remove any remaining backticks
      cleanContent = cleanContent.replace(/^`+|`+$/g, "");

      const parsedContent = JSON.parse(cleanContent);
      return {
        emailText: parsedContent.emailText || "",
        duringEmailClarification:
          parsedContent.duringEmailClarification || false,
        shouldSendEmail: parsedContent.shouldSendEmail || false,
        clarificationText: parsedContent.clarificationText || "",
      };
    } catch (error) {
      console.error("Failed to parse email response:", error);
      console.error("Original content:", content);
      return {
        emailText: "",
        duringEmailClarification: false,
        shouldSendEmail: false,
        clarificationText: "",
      };
    }
  }

  async execute(input: EmailTaskInput): Promise<EmailTaskOutput> {
    // Prepare messages for OpenAI call
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          input.emailToolPrompt?.prompt || "You are a helpful hotel assistant.",
        timestamp: Date.now(),
      },
      {
        role: "assistant",
        content: input.tenantConfig?.["email-prompt-config"] || "",
        timestamp: Date.now(),
      },
      {
        role: "system",
        content: createExcelMessage(
          input.excelConfig || "",
          input.excelData
        ),
        timestamp: Date.now(),
      },
    ];

    messages.push(
      {
        role: "user",
        content: input.userMessage,
        timestamp: Date.now(),
      },
      ...input.sessionHistory.messages.reverse()
    );

    // Create generation for this LLM call
    const generation = input.trace
      ? this.langfuseService.createGeneration(
          input.trace,
          "email-task",
          { messages },
          "o4-mini"
        )
      : null;

    // Call OpenAI directly
    const response = await this.openaiService
      .getClient()
      .chat.completions.create({
        model: "o4-mini",
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
        })),
        temperature: 0.5,
        max_tokens: 1000,
      });

    const content = response.choices[0].message.content || "";

    // Parse email response
    const emailData = this.parseEmailResponse(content);

    // Handle email sending if needed
    let emailSent = false;
    if (emailData.emailText && emailData.shouldSendEmail) {
      try {
        await this.emailService.sendEmail({
          to: "ai.agent.logs@pragmaticcoders.com",
          subject: `Hotel Guest Test Request - Language: ${input.detectedLanguage} - Tenant: ${input.tenantId}`,
          text: emailData.emailText,
        });
        console.log(
          "Email sent successfully to ai.agent.logs@pragmaticcoders.com"
        );
        emailSent = true;
      } catch (error) {
        console.error("Failed to send email:", error);
        // Don't fail the request if email sending fails
        emailSent = false;
      }
    }

    const result = {
      content,
      emailText: emailData.emailText,
      duringEmailClarification: emailData.duringEmailClarification,
      shouldSendEmail: emailData.shouldSendEmail,
      clarificationText: emailData.clarificationText,
      emailSent,
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
