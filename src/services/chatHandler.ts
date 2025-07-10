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

    // Start guestServiceTask and buttonsTask in parallel
    const guestServicePromise = guestServiceTask.execute({
      userMessage: chatRequest.message,
      sessionHistory: collectedData.sessionHistory,
      excelData: collectedData.excelData,
      guestServicePrompt: collectedData.prompts.guestService,
      excelConfig: collectedData.tenantConfig?.["excel-config"] ?? "",
      tenantConfig: collectedData.tenantConfig,
      sessionId: chatRequest.sessionId,
      trace,
    });

    const buttonsPromise = buttonsTask.execute({
      userMessage: chatRequest.message,
      // No firstCallOutput dependency
      excelData: collectedData.excelData,
      buttonsPrompt: collectedData.prompts.buttons,
      excelConfig: collectedData.tenantConfig?.["excel-config"] ?? "",
      tenantConfig: collectedData.tenantConfig,
      sessionId: chatRequest.sessionId,
      trace,
    });

    // Create a promise that waits for guestServiceTask and conditionally starts emailTask
    const emailPromise = guestServicePromise.then(async (firstResponse) => {
      if (firstResponse.isDuringServiceRequest) {
        return emailTask.execute({
          userMessage: chatRequest.message,
          firstCallOutput: firstResponse.content,
          excelData: collectedData.excelData,
          emailToolPrompt: collectedData.prompts.emailTool,
          excelConfig: collectedData.tenantConfig?.["excel-config"] ?? "",
          tenantConfig: collectedData.tenantConfig,
          sessionHistory: collectedData.sessionHistory,
          sessionId: chatRequest.sessionId,
          tenantId: chatRequest.tenantId,
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
