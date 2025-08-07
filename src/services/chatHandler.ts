import { Env, ChatRequest, ChatResponse } from "../types";
import { DataCollectionTask } from "../tasks/dataCollectionTask";
import { GuestServiceTask } from "../tasks/guestServiceTask";
import { ButtonsTask } from "../tasks/buttonsTask";
import { EmailTask } from "../tasks/emailTask";
import { ExcelSheetMatchingTask } from "../tasks/excelSheetMatchingTask";
import { ExcelDataFetchingTask } from "../tasks/excelDataFetchingTask";
import { MemoryService } from "./memory";
import { LangfuseService } from "./langfuse";
import { LLMService } from "./llm";
import { GoogleSheets } from "./googleSheets";
import { EmailService } from "./emailService";
import { DetailedUsage } from "../utils/usageTracker";

export class ChatHandler {
  private langfuseService: LangfuseService;
  private llmService: LLMService;
  private memoryService: MemoryService;
  private googleSheets: GoogleSheets;
  private emailService: EmailService;
  private env: Env;

  constructor(env: Env) {
    this.env = env;
    this.langfuseService = new LangfuseService(env);
    this.llmService = new LLMService(env);
    this.memoryService = new MemoryService(env);
    this.googleSheets = new GoogleSheets(env);
    this.emailService = new EmailService(env);
  }

  async processChat(chatRequest: ChatRequest): Promise<ChatResponse> {
    const { message: userMessage, ...metadata } = chatRequest;
    const tenantId = chatRequest.tenantId || "default";
    const sessionId = chatRequest.sessionId;
    const language = chatRequest.language;

    // Create Langfuse trace for the entire request with UTM tracking and button interaction
    const trace = this.langfuseService.createTrace({
      sessionId,
      input: {
        userMessage,
        language,
        tenantId,
      },
      metadata,
    });

    // Initialize by collecting data from all services
    const dataCollectionTask = new DataCollectionTask(
      this.langfuseService,
      this.memoryService,
      this.env.TENAT_CONFIG
    );
    const collectedData = await dataCollectionTask.collectData({
      sessionId,
      tenantId,
      trace,
    });

    // Configure LLM service with tenant-specific API keys if available
    this.llmService.configureTenantApiKeys(collectedData.tenantConfig);

    // Run Excel sheet matching task
    const excelSheetMatchingTask = new ExcelSheetMatchingTask(
      this.llmService,
      this.langfuseService
    );
    const excelSheetMatchingResult = await excelSheetMatchingTask.execute({
      userMessage,
      excelConfig: collectedData.tenantConfig?.["excel-config"] ?? "",
      sessionId,
      excelPrompt: collectedData.prompts.excel || null,
      llmConfig: collectedData.configs.excel,
      sessionHistory: collectedData.sessionHistory,
      trace,
    });

    // Get recommended sheets from Excel sheet matching result
    const recommendedSheets = excelSheetMatchingResult.recommendedSheets;

    // Run Excel data fetching task
    const excelDataFetchingTask = new ExcelDataFetchingTask(
      this.langfuseService,
      this.googleSheets,
      this.env.TENAT_KNOWLEDGE_CACHE
    );
    const excelDataResult = await excelDataFetchingTask.execute({
      recommendedSheets,
      tenantId,
      sessionId,
      spreadsheetId: collectedData.tenantConfig?.spreadsheetId,
      trace,
    });

    // Initialize tasks with shared services
    const guestServiceTask = new GuestServiceTask(
      this.langfuseService,
      this.llmService
    );
    const buttonsTask = new ButtonsTask(this.langfuseService, this.llmService);
    const emailTask = new EmailTask(
      this.langfuseService,
      this.llmService,
      this.emailService,
      this.memoryService
    );

    // Execute guest service task first
    const firstResponse = await guestServiceTask.execute({
      userMessage,
      sessionHistory: collectedData.sessionHistory,
      excelData: excelDataResult.excelData,
      guestServicePrompt: collectedData.prompts.guestService,
      tenantConfig: collectedData.tenantConfig,
      sessionId,
      llmConfig: collectedData.configs.guestService,
      trace,
    });

    // Execute buttons and email tasks in parallel, using guest service response as input for buttons
    const [secondResponse, thirdResponse] = await Promise.allSettled([
      buttonsTask.execute({
        userMessage: firstResponse.content, // Use answer output as input
        excelData: excelDataResult.excelData,
        buttonsPrompt: collectedData.prompts.buttons,
        tenantConfig: collectedData.tenantConfig,
        sessionId,
        llmConfig: collectedData.configs.buttons,
        sessionHistory: collectedData.sessionHistory,
        previousMessageLanguage: language,
        trace,
      }),
      emailTask.execute({
        userMessage,
        excelData: excelDataResult.excelData,
        emailToolPrompt: collectedData.prompts.emailTool,
        tenantConfig: collectedData.tenantConfig,
        sessionId,
        tenantId,
        llmConfig: collectedData.configs.emailTool,
        trace,
      }),
    ]);

    // Reset to default API keys after processing (optional, for cleanup)
    this.llmService.resetToDefaultApiKeys();

    // Guest service task result is already available since we awaited it
    const guestServiceResult = firstResponse;

    // Extract buttons task result with fallback to empty array if failed
    let buttons: Array<{
      type: "postback";
      title: string;
      payload: string;
      isUpsell: boolean;
    }> = [];
    let detectedLanguage = "en";
    let buttonsUsage = undefined;

    if (secondResponse.status === "fulfilled") {
      buttons = secondResponse.value.buttons;
      detectedLanguage = secondResponse.value.language;
      buttonsUsage = secondResponse.value.usage;
    } else {
      console.error("Buttons task failed:", secondResponse.reason);
      // Log failure for monitoring [[memory:3315930]]
      if (trace) {
        trace.update({
          metadata: {
            buttonsTaskFailure: {
              error:
                secondResponse.reason instanceof Error
                  ? secondResponse.reason.message
                  : String(secondResponse.reason),
              timestamp: new Date().toISOString(),
            },
          },
        });
      }
    }

    // Extract email task result with fallback to guest service response if failed
    let responseText = guestServiceResult.content;
    let emailUsage = undefined;

    if (thirdResponse.status === "fulfilled") {
      // Use email response text if during email clarification, otherwise use guest service response
      responseText =
        (thirdResponse.value.duringEmailClarification ||
          thirdResponse.value.shouldSendEmail)
          ? thirdResponse.value.responseText
          : guestServiceResult.content;
      emailUsage = thirdResponse.value.usage;
    } else {
      console.error("Email task failed:", thirdResponse.reason);
      if (trace) {
        trace.update({
          metadata: {
            emailTaskFailure: {
              error:
                thirdResponse.reason instanceof Error
                  ? thirdResponse.reason.message
                  : String(thirdResponse.reason),
              timestamp: new Date().toISOString(),
            },
          },
        });
      }
      // Use guest service response as fallback
      responseText = guestServiceResult.content;
    }

    // Create the response structure
    const response: ChatResponse = {
      recipient: {
        id: sessionId,
      },
      messaging_type: "RESPONSE",
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            language: detectedLanguage,
            text: responseText,
            buttons,
          },
        },
      },
    };

    // Save session memory before sending response
    try {
      await this.memoryService.updateSessionWithConversation({
        tenantId,
        sessionId,
        sessionMemory: collectedData.sessionHistory,
        userMessage,
        assistantResponse: responseText,
      });
    } catch (error) {
      console.error("Failed to save session memory:", error);
      // Don't fail the request if memory saving fails
    }

    // Calculate aggregate usage and costs
    const allTaskUsages = [
      guestServiceResult.usage,
      buttonsUsage,
      emailUsage,
      excelSheetMatchingResult.usage,
    ].filter(Boolean);

    const aggregateUsage: DetailedUsage = {
      input: allTaskUsages.reduce(
        (sum, usage) => sum + (usage?.promptTokens || 0),
        0
      ),
      output: allTaskUsages.reduce(
        (sum, usage) => sum + (usage?.completionTokens || 0),
        0
      ),
      total: allTaskUsages.reduce(
        (sum, usage) => sum + (usage?.totalTokens || 0),
        0
      ),
    };

    // End the trace with the final response and usage summary
    trace.update({
      output: response,
      metadata: {
        tenantId,
        sessionId,
        detectedLanguage,
        upSellButtons: buttons.filter((button) => button.isUpsell === true)
          .length,
        taskCount: 4, // guestService, buttons, email, excelSheetMatching
        totalTokensUsed: aggregateUsage.total,
        aggregateUsage,
        tasksCompleted: [
          "GuestServiceTask",
          "ButtonsTask",
          "EmailTask",
          "ExcelSheetMatchingTask",
          "ExcelDataFetchingTask",
        ],
      },
    });

    // Flush Langfuse before returning
    await this.langfuseService.flush();

    return response;
  }
}
