import { LangfuseService } from "../services/langfuse";
import { GoogleSheets } from "../services/googleSheets";
import { MemoryService } from "../services/memory";
import { Env, LangfusePrompt, ChatMessage } from "../types";

export interface DataCollectionResult {
  prompts: {
    guestService: LangfusePrompt | null;
    buttons: LangfusePrompt | null;
    knowledgeBaseTool: LangfusePrompt | null;
  };
  excelData: string;
  sessionHistory: ChatMessage[];
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
   * @param sheetIndex Optional sheet index for Google Sheets (default: 0)
   * @returns Promise<DataCollectionResult>
   */
  async collectData(
    sessionId: string,
    sheetIndex: number = 0
  ): Promise<DataCollectionResult> {
    try {
      // Collect all data in parallel for better performance
      const [
        guestServicePrompt,
        buttonsPrompt,
        knowledgeBaseToolPrompt,
        excelData,
        sessionHistory,
      ] = await Promise.allSettled([
        this.langfuseService.getPrompt("guest-service"),
        this.langfuseService.getPrompt("buttons"),
        this.langfuseService.getPrompt("knowledge-base-tool"),
        this.googleSheets.readEntireSpreadsheetAsMarkdown(sheetIndex),
        this.memoryService.getConversationHistory(sessionId),
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
        },
        excelData:
          excelData.status === "fulfilled"
            ? excelData.value
            : "Error loading Excel data",
        sessionHistory:
          sessionHistory.status === "fulfilled" ? sessionHistory.value : [],
      };
    } catch (error) {
      console.error("Error in data collection task:", error);
      throw error;
    }
  }

  /**
   * Collect data with comprehensive hotel knowledge base report
   * @param sessionId The session ID to get history for
   * @returns Promise<DataCollectionResult>
   */
  async collectDataWithKnowledgeBase(
    sessionId: string
  ): Promise<DataCollectionResult> {
    try {
      const [
        guestServicePrompt,
        buttonsPrompt,
        knowledgeBaseToolPrompt,
        hotelKnowledgeBase,
        sessionHistory,
      ] = await Promise.allSettled([
        this.langfuseService.getPrompt("guest-service"),
        this.langfuseService.getPrompt("buttons"),
        this.langfuseService.getPrompt("knowledge-base-tool"),
        this.googleSheets.generateHotelKnowledgeBaseReport(),
        this.memoryService.getConversationHistory(sessionId),
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
        },
        excelData:
          hotelKnowledgeBase.status === "fulfilled"
            ? hotelKnowledgeBase.value
            : "Error loading hotel knowledge base",
        sessionHistory:
          sessionHistory.status === "fulfilled" ? sessionHistory.value : [],
      };
    } catch (error) {
      console.error(
        "Error in data collection task with knowledge base:",
        error
      );
      throw error;
    }
  }

  /**
   * Collect data from multiple sheets
   * @param sessionId The session ID to get history for
   * @param sheetIndices Array of sheet indices to read (default: [0])
   * @returns Promise<DataCollectionResult>
   */
  async collectDataFromMultipleSheets(
    sessionId: string,
    sheetIndices: number[] = [0]
  ): Promise<DataCollectionResult> {
    try {
      const [
        guestServicePrompt,
        buttonsPrompt,
        knowledgeBaseToolPrompt,
        multipleSheetsData,
        sessionHistory,
      ] = await Promise.allSettled([
        this.langfuseService.getPrompt("guest-service"),
        this.langfuseService.getPrompt("buttons"),
        this.langfuseService.getPrompt("knowledge-base-tool"),
        this.googleSheets.readMultipleSheetsAsMarkdown(sheetIndices),
        this.memoryService.getConversationHistory(sessionId),
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
        },
        excelData:
          multipleSheetsData.status === "fulfilled"
            ? multipleSheetsData.value
            : "Error loading multiple sheets data",
        sessionHistory:
          sessionHistory.status === "fulfilled" ? sessionHistory.value : [],
      };
    } catch (error) {
      console.error(
        "Error in data collection task with multiple sheets:",
        error
      );
      throw error;
    }
  }

  /**
   * Get only the prompts (useful for testing or when only prompts are needed)
   * @returns Promise with all three prompts
   */
  async getPromptsOnly(): Promise<{
    guestService: LangfusePrompt | null;
    buttons: LangfusePrompt | null;
    knowledgeBaseTool: LangfusePrompt | null;
  }> {
    try {
      const [guestServicePrompt, buttonsPrompt, knowledgeBaseToolPrompt] =
        await Promise.allSettled([
          this.langfuseService.getPrompt("guest-service"),
          this.langfuseService.getPrompt("buttons"),
          this.langfuseService.getPrompt("knowledge-base-tool"),
        ]);

      return {
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
      };
    } catch (error) {
      console.error("Error getting prompts:", error);
      throw error;
    }
  }
}
