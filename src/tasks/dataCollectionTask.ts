import { LangfuseService } from "../services/langfuse";
import { GoogleSheets } from "../services/googleSheets";
import { MemoryService } from "../services/memory";
import { LangfusePrompt, SessionMemory } from "../types";
import { LangfuseTraceClient } from "langfuse";

export interface TenantConfig {
  spreadsheetId: string;
  "general-prompt-config": string;
  "buttons-prompt-config": string;
  "email-prompt-config": string;
}

export interface DataCollectionResult {
  prompts: {
    guestService: LangfusePrompt | null;
    buttons: LangfusePrompt | null;
    knowledgeBaseTool: LangfusePrompt | null;
    emailTool: LangfusePrompt | null;
  };
  excelData: string;
  sessionHistory: SessionMemory;
  tenantConfig: TenantConfig | null;
}

export class DataCollectionTask {
  private langfuseService: LangfuseService;
  private googleSheets: GoogleSheets;
  private memoryService: MemoryService;
  private tenantConfigKV: KVNamespace;

  constructor(
    langfuseService: LangfuseService,
    googleSheets: GoogleSheets,
    memoryService: MemoryService,
    tenantConfigKV: KVNamespace
  ) {
    this.langfuseService = langfuseService;
    this.googleSheets = googleSheets;
    this.memoryService = memoryService;
    this.tenantConfigKV = tenantConfigKV;
  }

  /**
   * Fetch tenant configuration from KV store
   * @param tenantId The tenant ID to fetch configuration for
   * @returns Promise<TenantConfig | null>
   */
  private async fetchTenantConfig(
    tenantId: string
  ): Promise<TenantConfig | null> {
    try {
      const configString = await this.tenantConfigKV.get(tenantId);
      if (!configString) {
        console.warn(`No tenant config found for tenantId: ${tenantId}`);
        return null;
      }
      return JSON.parse(configString) as TenantConfig;
    } catch (error) {
      console.error(`Error fetching tenant config for ${tenantId}:`, error);
      return null;
    }
  }

  /**
   * Collect data from all three services
   * @param sessionId The session ID to get history for
   * @param tenantId The tenant ID to fetch configuration for
   * @param trace Optional Langfuse trace object
   * @returns Promise<DataCollectionResult>
   */
  async collectData(
    sessionId: string,
    tenantId: string,
    trace?: LangfuseTraceClient
  ): Promise<DataCollectionResult> {
    try {
      // Create span for this task
      const span = trace
        ? this.langfuseService.createSpan(trace, "data-collection-task", {
            sessionId,
            tenantId,
          })
        : null;

      // Fetch tenant configuration first
      const tenantConfig = await this.fetchTenantConfig(tenantId);

      // Helper function to measure promise execution time
      const measurePromise = async <T>(
        promise: Promise<T>,
        name: string
      ): Promise<{ result: PromiseSettledResult<T>; time: number }> => {
        const start = performance.now();
        const result = await Promise.allSettled([promise]);
        const end = performance.now();
        return { result: result[0], time: (end - start) / 1000 }; // Convert to seconds
      };

      // Collect all data in parallel with timing
      const [
        guestServiceResult,
        buttonsResult,
        knowledgeBaseToolResult,
        emailToolResult,
        excelDataResult,
        sessionHistoryResult,
      ] = await Promise.all([
        measurePromise(
          this.langfuseService.getPrompt("general"),
          "guest-service-prompt"
        ),
        measurePromise(
          this.langfuseService.getPrompt("buttons"),
          "buttons-prompt"
        ),
        measurePromise(
          this.langfuseService.getPrompt("excel"),
          "knowledge-base-tool-prompt"
        ),
        measurePromise(this.langfuseService.getPrompt("email"), "email-prompt"),
        measurePromise(
          this.googleSheets.collectAllSheetsAsMarkdown(
            tenantConfig?.spreadsheetId
          ),
          "excel-data"
        ),
        measurePromise(
          this.memoryService.getSessionMemory(sessionId),
          "session-history"
        ),
      ]);

      // Extract results and times
      const guestServicePrompt = guestServiceResult.result;
      const buttonsPrompt = buttonsResult.result;
      const knowledgeBaseToolPrompt = knowledgeBaseToolResult.result;
      const emailToolPrompt = emailToolResult.result;
      const excelData = excelDataResult.result;
      const sessionHistory = sessionHistoryResult.result;

      // Create timing metadata
      const timingMetadata = {
        guestServicePromptTime: guestServiceResult.time,
        buttonsPromptTime: buttonsResult.time,
        knowledgeBaseToolPromptTime: knowledgeBaseToolResult.time,
        emailPromptTime: emailToolResult.time,
        excelDataTime: excelDataResult.time,
        sessionHistoryTime: sessionHistoryResult.time,
      };

      const result = {
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
        tenantConfig,
      };

      // End span with timing metadata
      if (span) {
        span.end({
          output: result,
          metadata: timingMetadata,
        });
      }

      return result;
    } catch (error) {
      console.error("Error in data collection task:", error);
      throw error;
    }
  }
}
