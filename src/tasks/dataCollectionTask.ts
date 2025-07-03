import { LangfuseService } from "../services/langfuse";
import { GoogleSheets } from "../services/googleSheets";
import { MemoryService } from "../services/memory";
import { Env, LangfusePrompt, SessionMemory } from "../types";

export interface DataCollectionResult {
  prompts: {
    guestService: LangfusePrompt | null;
    buttons: LangfusePrompt | null;
    knowledgeBaseTool: LangfusePrompt | null;
    emailTool: LangfusePrompt | null;
  };
  excelData: string;
  sessionHistory: SessionMemory;
}

export class DataCollectionTask {
  private langfuseService: LangfuseService;
  private googleSheets: GoogleSheets;
  private memoryService: MemoryService;

  constructor(env: Env) {
    this.langfuseService = new LangfuseService(env);
    this.googleSheets = new GoogleSheets(env);
    this.memoryService = new MemoryService(env);
  }

  /**
   * Collect data from all three services
   * @param sessionId The session ID to get history for
   * @returns Promise<DataCollectionResult>
   */
  async collectData(sessionId: string): Promise<DataCollectionResult> {
    try {
      // Collect all data in parallel for better performance
      const [
        guestServicePrompt,
        buttonsPrompt,
        knowledgeBaseToolPrompt,
        emailToolPrompt,
        excelData,
        sessionHistory,
      ] = await Promise.allSettled([
        this.langfuseService.getPrompt("guest-service"),
        this.langfuseService.getPrompt("buttons"),
        this.langfuseService.getPrompt("knowledge-base-tool"),
        this.langfuseService.getPrompt("email"),
        this.googleSheets.collectAllSheetsAsMarkdown(),
        this.memoryService.getSessionMemory(sessionId),
      ]);

      return {
        prompts: {
          guestService:
            guestServicePrompt.status === "fulfilled"
              ? guestServicePrompt.value
              : null,
          buttons:
            buttonsPrompt.status === "fulfilled" ? buttonsPrompt.value : null,
          knowledgeBaseTool:
            knowledgeBaseToolPrompt.status === "fulfilled"
              ? knowledgeBaseToolPrompt.value
              : null,
          emailTool:
            emailToolPrompt.status === "fulfilled"
              ? emailToolPrompt.value
              : null,
        },
        excelData:
          excelData.status === "fulfilled"
            ? excelData.value
            : "Error loading Excel data",
        sessionHistory:
          sessionHistory.status === "fulfilled" && sessionHistory.value
            ? sessionHistory.value
            : {
                messages: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
      };
    } catch (error) {
      console.error("Error in data collection task:", error);
      throw error;
    }
  }
}
