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
      this.env.TENAT_CONFIG
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
    const emailTask = new EmailTask(this.langfuseService, this.openaiService);

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

    // 2nd & 3rd OpenAI calls: run in parallel using first call output
    const [secondResponse, thirdResponse] = await Promise.all([
      buttonsTask.execute({
        userMessage: chatRequest.message,
        firstCallOutput: firstResponse.content,
        excelData: collectedData.excelData,
        buttonsPrompt: collectedData.prompts.buttons,
        knowledgeBasePrompt: collectedData.prompts.knowledgeBaseTool,
        tenantConfig: collectedData.tenantConfig,
        sessionId: chatRequest.sessionId,
        trace,
      }),
      emailTask.execute({
        userMessage: chatRequest.message,
        firstCallOutput: firstResponse.content,
        excelData: collectedData.excelData,
        emailToolPrompt: collectedData.prompts.emailTool,
        knowledgeBasePrompt: collectedData.prompts.knowledgeBaseTool,
        tenantConfig: collectedData.tenantConfig,
        sessionHistory: collectedData.sessionHistory,
        sessionId: chatRequest.sessionId,
        trace,
      }),
    ]);

    // Parse buttons from secondResponse
    const buttonsData = this.parseButtons(secondResponse.content);
    const buttons = buttonsData.buttons;
    const detectedLanguage = buttonsData.language;

    let thirdResponseContent;
    try {
      thirdResponseContent = JSON.parse(thirdResponse.content);
    } catch (error) {
      console.error("Failed to parse third response:", error);
      thirdResponseContent = {
        emailText: "",
        duringEmailClarification: false,
        shouldSendEmail: false,
        clarificationText: "",
      };
    }

    if (thirdResponseContent.emailText) {
      try {
        await this.emailService.sendEmail({
          to: "ai.agent.logs@pragmaticcoders.com",
          subject: `Hotel Guest Test Request - Language: ${detectedLanguage} - Tenant: ${chatRequest.tenantId}`,
          text: thirdResponseContent.emailText,
        });
        console.log(
          "Email sent successfully to pawel.mizwa@pragmaticcoders.com"
        );
      } catch (error) {
        console.error("Failed to send email:", error);
        // Don't fail the request if email sending fails
      }
    }

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
            text: thirdResponseContent.duringEmailClarification
              ? thirdResponseContent.clarificationText
              : firstResponse.content,
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
        thirdResponse.content
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

  private parseButtons(content: string): {
    buttons: Array<{ type: "postback"; title: string; payload: string }>;
    language: string;
  } {
    try {
      const buttonsData = JSON.parse(content);
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
    }
    return {
      buttons: [],
      language: "en",
    };
  }
}
