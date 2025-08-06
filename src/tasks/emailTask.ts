import { LangfuseService } from "../services/langfuse";
import { LLMService } from "../services/llm";
import { EmailService } from "../services/emailService";
import { MemoryService } from "../services/memory";
import { ChatMessage, SessionMemory, LangfusePrompt } from "../types";
import { TenantConfig } from "./dataCollectionTask";
import { LangfuseTraceClient } from "langfuse";
import { parseLLMResult } from "../utils/llmResultParser";
import { TaskLLMConfig } from "../config/llmConfig";
import { validateMessagesForAnthropic } from "../utils/messageValidator";
import { convertToDetailedUsage, logUsageDetails } from "../utils/usageTracker";

export interface EmailTaskInput {
  userMessage: string;
  excelData: string;
  emailToolPrompt: LangfusePrompt | null;
  tenantConfig: TenantConfig | null;
  // Remove sessionHistory from input since we'll manage our own
  sessionId: string;
  tenantId?: string;
  llmConfig: TaskLLMConfig;
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
  private memoryService: MemoryService;

  constructor(
    langfuseService: LangfuseService,
    llmService: LLMService,
    emailService: EmailService,
    memoryService: MemoryService
  ) {
    this.langfuseService = langfuseService;
    this.llmService = llmService;
    this.emailService = emailService;
    this.memoryService = memoryService;
  }

  private async getEmailSessionMemory(
    tenantId: string,
    sessionId: string
  ): Promise<SessionMemory> {
    const emailSessionMemory = await this.memoryService.getEmailSessionMemory(
      tenantId,
      sessionId
    );
    if (!emailSessionMemory) {
      return {
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    return emailSessionMemory;
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
    // Get email-specific session history
    const emailSessionHistory = await this.getEmailSessionMemory(
      input.tenantId || "default",
      input.sessionId
    );

    // Prepare messages for OpenAI call using email session history
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          input.emailToolPrompt?.prompt || "You are a helpful hotel assistant.",
        timestamp: Date.now(),
      },
      {
        role: "system",
        content: input.tenantConfig?.["email-prompt-config"] || "",
        timestamp: Date.now(),
      },
      {
        role: "system",
        content: input.excelData,
        timestamp: Date.now(),
      },
      {
        role: "system",
        content: "Today's date is: " + new Date().toISOString(),
        timestamp: Date.now(),
      },
      ...emailSessionHistory.messages,
      {
        role: "user",
        content: input.userMessage,
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
          "email-task",
          { messages: validatedMessages },
          llmConfig.model
        )
      : null;

    // Call LLM service with new architecture
    let response;
    try {
      response = await this.llmService.createCompletion(validatedMessages, {
        model: llmConfig.model,
        provider: llmConfig.provider,
        temperature: llmConfig.temperature,
        maxTokens: llmConfig.maxTokens,
      });
    } catch (error) {
      // Try alternative model
      try {
        const alternativeResponse = await this.llmService.createCompletion(
          validatedMessages,
          {
            model: llmConfig.alternative.model,
            provider: llmConfig.alternative.provider,
            temperature: llmConfig.alternative.temperature,
            maxTokens: llmConfig.alternative.maxTokens,
          }
        );
        response = alternativeResponse;
      } catch (alternativeError) {
        await this.memoryService.updateEmailSessionWithConversation(
          input.tenantId || "default",
          input.sessionId,
          input.userMessage,
          ""
        );
        console.error("Failed to use alternative model:", alternativeError);
        // Log LLM failure to Langfuse generation
        if (generation) {
          generation.update({
            metadata: {
              llmError: {
                message: error instanceof Error ? error.message : String(error),
                task: "EmailTask",
                model: llmConfig.model,
                provider: llmConfig.provider,
                timestamp: new Date().toISOString(),
              },
            },
          });
        }
        throw error;
      }
    }

    const content = response.content;

    // Parse email response
    const emailData = this.parseEmailResponse(content, generation);

    // Handle email sending if needed
    let emailSent = false;
    if (emailData.emailText && emailData.shouldSendEmail) {
      try {
        // Get email recipients from tenant config with fallback
        const emailRecipients =
          input.tenantConfig?.emailTo && input.tenantConfig.emailTo.length > 0
            ? input.tenantConfig.emailTo
            : ["ai.agent.logs@pragmaticcoders.com"];

        // Send email to all recipients
        await this.emailService.sendEmail({
          to: emailRecipients,
          subject: `Hotel Guest Request - Tenant: ${input.tenantId}`,
          text: emailData.emailText,
        });

        console.log(
          `Email sent successfully to: ${emailRecipients.join(", ")}`
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

    // End generation with detailed usage tracking
    if (generation) {
      const detailedUsage = convertToDetailedUsage(
        result.usage,
        response.model,
        response.provider
      );

      if (detailedUsage) {
        logUsageDetails("EmailTask", detailedUsage, response.model);
        this.langfuseService.endGenerationWithUsage(
          generation,
          result.content,
          detailedUsage
        );
      } else {
        generation.end({ output: result.content });
      }
    }

    // Update email session history with the conversation
    try {
      await this.memoryService.updateEmailSessionWithConversation(
        input.tenantId || "default",
        input.sessionId,
        input.userMessage,
        result.responseText || result.content
      );
    } catch (error) {
      console.error("Failed to save email session memory:", error);
      // Don't fail the request if memory saving fails
    }

    return result;
  }
}
