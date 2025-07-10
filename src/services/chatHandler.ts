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

    // 1st OpenAI call: user input + history + excel + guest-service prompt
    const firstResponse = await guestServiceTask.execute({
      userMessage: chatRequest.message,
      sessionHistory: collectedData.sessionHistory,
      excelData: collectedData.excelData,
      guestServicePrompt: collectedData.prompts.guestService,
      knowledgeBasePrompt: collectedData.prompts.knowledgeBaseTool,
      tenantConfig: collectedData.tenantConfig,
      sessionId: chatRequest.sessionId,
      trace,
    });

    // 2nd OpenAI call: buttons task
    const secondResponse = await buttonsTask.execute({
      userMessage: chatRequest.message,
      firstCallOutput: firstResponse.content,
      excelData: collectedData.excelData,
      buttonsPrompt: collectedData.prompts.buttons,
      knowledgeBasePrompt: collectedData.prompts.knowledgeBaseTool,
      tenantConfig: collectedData.tenantConfig,
      sessionId: chatRequest.sessionId,
      trace,
    });

    // Use parsed buttons from secondResponse
    const buttons = secondResponse.buttons;
    const detectedLanguage = secondResponse.language;

    // 3rd OpenAI call: email task with detected language
    const thirdResponse = await emailTask.execute({
      userMessage: chatRequest.message,
      firstCallOutput: firstResponse.content,
      excelData: collectedData.excelData,
      emailToolPrompt: collectedData.prompts.emailTool,
      knowledgeBasePrompt: collectedData.prompts.knowledgeBaseTool,
      tenantConfig: collectedData.tenantConfig,
      sessionHistory: collectedData.sessionHistory,
      sessionId: chatRequest.sessionId,
      tenantId: chatRequest.tenantId,
      detectedLanguage: detectedLanguage,
      trace,
    });

    const responseText = thirdResponse.duringEmailClarification
      ? thirdResponse.clarificationText
      : firstResponse.content;

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
          emailTask: thirdResponse.usage,
        },
      },
    });

    // Flush Langfuse before returning
    await this.langfuseService.flush();

    return response;
  }
}
