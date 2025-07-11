import { LangfuseService } from "../services/langfuse";
import { LLMService } from "../services/llm";
import { EmailService } from "../services/emailService";
import { ChatMessage, LangfusePrompt, SessionMemory } from "../types";
import { TenantConfig } from "./dataCollectionTask";
import { LangfuseTraceClient } from "langfuse";
import { parseLLMResult } from "../utils/llmResultParser";
import { getLLMConfig } from "../config/llmConfig";

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
  trace?: LangfuseTraceClient; // Langfuse trace object
}

export interface EmailTaskOutput {
  content: string;
  emailText: string;
  duringEmailClarification: boolean;
  shouldSendEmail: boolean;
  responseText: string;
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
  private llmService: LLMService;
  private emailService: EmailService;

  constructor(
    langfuseService: LangfuseService,
    llmService: LLMService,
    emailService: EmailService
  ) {
    this.langfuseService = langfuseService;
    this.llmService = llmService;
    this.emailService = emailService;
  }

  private parseEmailResponse(
    content: string,
    generation?: any
  ): {
    emailText: string;
    duringEmailClarification: boolean;
    shouldSendEmail: boolean;
    responseText: string;
  } {
    interface EmailResponse {
      emailText?: string;
      duringEmailClarification?: boolean;
      shouldSendEmail?: boolean;
      responseText?: string;
    }

    const fallback: EmailResponse = {
      emailText: "",
      duringEmailClarification: false,
      shouldSendEmail: false,
      responseText: "",
    };

    const parsedContent = parseLLMResult<EmailResponse>(
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
                  task: "EmailTask",
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

    return {
      emailText: parsedContent.emailText || "",
      duringEmailClarification: parsedContent.duringEmailClarification || false,
      shouldSendEmail: parsedContent.shouldSendEmail || false,
      responseText: parsedContent.responseText || "",
    };
  }

  async execute(input: EmailTaskInput): Promise<EmailTaskOutput> {
    // Prepare messages for OpenAI call
    const messages: ChatMessage[] = [
      {
        role: "user",
        content: input.userMessage,
        timestamp: Date.now(),
      },
      ...input.sessionHistory.messages
        .filter((msg) => msg.role === "user")
        .reverse(),
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
        content: input.excelData,
        timestamp: Date.now(),
      },
      {
        role: "assistant",
        content: `User provided the following information: \n${
          input.userMessage
        }\n${input.sessionHistory.messages
          .filter((msg) => msg.role === "user")
          .map((msg) => msg.content)
          .join("\n")}`,
        timestamp: Date.now(),
      },
    ];

    messages.push();

    // Get LLM configuration for this task
    const llmConfig = getLLMConfig("emailTask");

    // Create generation for this LLM call
    const generation = input.trace
      ? this.langfuseService.createGeneration(
          input.trace,
          "email-task",
          { messages },
          llmConfig.model
        )
      : null;

    // Call LLM service with new architecture
    const response = await this.llmService.createCompletion(messages, {
      model: llmConfig.model,
      provider: llmConfig.provider,
      temperature: llmConfig.temperature,
      maxTokens: llmConfig.maxTokens,
    });

    const content = response.content;

    // Parse email response
    const emailData = this.parseEmailResponse(content, generation);

    // Handle email sending if needed
    let emailSent = false;
    if (emailData.emailText && emailData.shouldSendEmail) {
      try {
        await this.emailService.sendEmail({
          to: "ai.agent.logs@pragmaticcoders.com",
          subject: `Hotel Guest Test Request - Tenant: ${input.tenantId}`,
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
      responseText: emailData.responseText,
      emailSent,
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
