import { Env, ChatRequest, ChatResponse } from "../types";
import { DataCollectionTask } from "../tasks/dataCollectionTask";
import { GuestServiceTask } from "../tasks/guestServiceTask";
import { ButtonsTask } from "../tasks/buttonsTask";
import { EmailTask } from "../tasks/emailTask";
import { MemoryService } from "./memory";
import { LangfuseService } from "./langfuse";
import { OpenAIService } from "./openaiService";
import { GoogleSheets } from "./googleSheets";
import { EmailService } from "./emailService";

export class ChatHandler {
  private langfuseService: LangfuseService;
  private openaiService: OpenAIService;
  private memoryService: MemoryService;
  private googleSheets: GoogleSheets;
  private emailService: EmailService;
  private env: Env;

  constructor(env: Env) {
    this.env = env;
    this.langfuseService = new LangfuseService(env);
    this.openaiService = new OpenAIService(env);
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
      this.googleSheets,
      this.memoryService,
      this.env.TENAT_CONFIG,
      this.env.TENAT_KNOWLEDGE_CACHE
    );
    const collectedData = await dataCollectionTask.collectData(
      chatRequest.sessionId,
      chatRequest.tenantId || "default",
      trace
    );

    // Initialize tasks with shared services
    const guestServiceTask = new GuestServiceTask(
      this.langfuseService,
      this.openaiService
    );
    const buttonsTask = new ButtonsTask(
      this.langfuseService,
      this.openaiService
    );
    const emailTask = new EmailTask(
      this.langfuseService,
      this.openaiService,
      this.emailService
    );

    // Run guestServiceTask and buttonsTask in parallel (without firstCallOutput dependency)
    const [firstResponse, secondResponse] = await Promise.all([
      guestServiceTask.execute({
        userMessage: chatRequest.message,
        sessionHistory: collectedData.sessionHistory,
        excelData: collectedData.excelData,
        guestServicePrompt: collectedData.prompts.guestService,
        excelConfig: collectedData.tenantConfig?.["excel-config"] ?? "",
        tenantConfig: collectedData.tenantConfig,
        sessionId: chatRequest.sessionId,
        trace,
      }),
      buttonsTask.execute({
        userMessage: chatRequest.message,
        // No firstCallOutput dependency
        excelData: collectedData.excelData,
        buttonsPrompt: collectedData.prompts.buttons,
        excelConfig: collectedData.tenantConfig?.["excel-config"] ?? "",
        tenantConfig: collectedData.tenantConfig,
        sessionId: chatRequest.sessionId,
        trace,
      }),
    ]);

    // Use parsed buttons from secondResponse
    const buttons = secondResponse.buttons;
    const detectedLanguage = secondResponse.language;

    // Conditionally run email task only when isDuringServiceRequest is true
    let thirdResponse = null;
    if (firstResponse.isDuringServiceRequest) {
      thirdResponse = await emailTask.execute({
        userMessage: chatRequest.message,
        firstCallOutput: firstResponse.content,
        excelData: collectedData.excelData,
        emailToolPrompt: collectedData.prompts.emailTool,
        excelConfig: collectedData.tenantConfig?.["excel-config"] ?? "",
        tenantConfig: collectedData.tenantConfig,
        sessionHistory: collectedData.sessionHistory,
        sessionId: chatRequest.sessionId,
        tenantId: chatRequest.tenantId,
        detectedLanguage: detectedLanguage,
        trace,
      });
    }

    // Use the parsed text from guest service response, or clarification text if email task was executed
    const responseText = thirdResponse?.duringEmailClarification
      ? thirdResponse.clarificationText
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
