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
    // Create Langfuse trace for the entire request
    const trace = this.langfuseService.createTrace(chatRequest.sessionId, {
      userMessage: chatRequest.message,
      language: chatRequest.language,
    });

    // Initialize by collecting data from all services
    const dataCollectionTask = new DataCollectionTask(
      this.langfuseService,
      this.memoryService,
      this.env.TENAT_CONFIG
    );
    const collectedData = await dataCollectionTask.collectData(
      chatRequest.sessionId,
      chatRequest.tenantId || "default",
      trace
    );

    // Run Excel sheet matching task
    const excelSheetMatchingTask = new ExcelSheetMatchingTask(
      this.llmService,
      this.langfuseService
    );
    const excelSheetMatchingResult = await excelSheetMatchingTask.execute({
      userMessage: chatRequest.message,
      excelConfig: collectedData.tenantConfig?.["excel-config"] ?? "",
      sessionId: chatRequest.sessionId,
      excelPrompt: collectedData.prompts.excel || null,
      llmConfig: collectedData.configs.excel,
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
      tenantId: chatRequest.tenantId || "default",
      sessionId: chatRequest.sessionId,
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
      this.emailService
    );

    // Start guestServiceTask and buttonsTask in parallel
    const guestServicePromise = guestServiceTask.execute({
      userMessage: chatRequest.message,
      sessionHistory: collectedData.sessionHistory,
      excelData: excelDataResult.excelData,
      guestServicePrompt: collectedData.prompts.guestService,
      tenantConfig: collectedData.tenantConfig,
      sessionId: chatRequest.sessionId,
      llmConfig: collectedData.configs.guestService,
      trace,
    });

    const buttonsPromise = buttonsTask.execute({
      userMessage: chatRequest.message,
      // No firstCallOutput dependency
      excelData: excelDataResult.excelData,
      buttonsPrompt: collectedData.prompts.buttons,
      tenantConfig: collectedData.tenantConfig,
      sessionId: chatRequest.sessionId,
      llmConfig: collectedData.configs.buttons,
      trace,
    });

    // Create a promise that waits for guestServiceTask and conditionally starts emailTask
    const emailPromise = guestServicePromise.then(async (firstResponse) => {
      if (firstResponse.isDuringServiceRequest) {
        return emailTask.execute({
          userMessage: chatRequest.message,
          firstCallOutput: firstResponse.content,
          excelData: excelDataResult.excelData,
          emailToolPrompt: collectedData.prompts.emailTool,
          tenantConfig: collectedData.tenantConfig,
          sessionHistory: collectedData.sessionHistory,
          sessionId: chatRequest.sessionId,
          tenantId: chatRequest.tenantId,
          llmConfig: collectedData.configs.emailTool,
          trace,
        });
      }
      return Promise.resolve(null); // No email task needed
    });

    // Wait for all tasks to complete using Promise.all
    const [firstResponse, secondResponse, thirdResponse] = await Promise.all([
      guestServicePromise,
      buttonsPromise,
      emailPromise,
    ]);

    // Use parsed buttons from secondResponse
    const buttons = secondResponse.buttons;
    const detectedLanguage = secondResponse.language;

    // Use the parsed text from guest service response, or response text if email task was executed
    const responseText = thirdResponse?.duringEmailClarification
      ? thirdResponse.responseText
      : firstResponse.text;

    // Create the response structure
    const response: ChatResponse = {
      recipient: {
        id: chatRequest.sessionId,
      },
      messaging_type: "RESPONSE",
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            language: detectedLanguage,
            text: responseText,
            buttons: buttons,
          },
        },
      },
    };

    // Save session memory before sending response
    try {
      await this.memoryService.updateSessionWithConversation(
        chatRequest.sessionId,
        collectedData.sessionHistory,
        chatRequest.message,
        responseText
      );
    } catch (error) {
      console.error("Failed to save session memory:", error);
      // Don't fail the request if memory saving fails
    }

    // End the trace with the final response and usage summary
    trace.update({
      output: response,
      metadata: {
        taskBreakdown: {
          guestServiceTask: firstResponse.usage,
          buttonsTask: secondResponse.usage,
          emailTask: thirdResponse?.usage,
        },
      },
    });

    // Flush Langfuse before returning
    await this.langfuseService.flush();

    return response;
  }
}
