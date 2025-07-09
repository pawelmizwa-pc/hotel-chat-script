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

interface CachedExcelData {
  data: string;
  timestamp: number;
  tenantId: string;
}

export class DataCollectionTask {
  private langfuseService: LangfuseService;
  private googleSheets: GoogleSheets;
  private memoryService: MemoryService;
  private tenantConfigKV: KVNamespace;
  private tenantKnowledgeCache: KVNamespace;
  private readonly CACHE_EXPIRY_MS = 60 * 60 * 1000; // 1 hour in milliseconds

  constructor(
    langfuseService: LangfuseService,
    googleSheets: GoogleSheets,
    memoryService: MemoryService,
    tenantConfigKV: KVNamespace,
    tenantKnowledgeCache: KVNamespace
  ) {
    this.langfuseService = langfuseService;
    this.googleSheets = googleSheets;
    this.memoryService = memoryService;
    this.tenantConfigKV = tenantConfigKV;
    this.tenantKnowledgeCache = tenantKnowledgeCache;
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
   * Generate cache key for Excel data
   * @param tenantId The tenant ID
   * @returns string Cache key
   */
  private getCacheKey(tenantId: string): string {
    return `excel-data:${tenantId}`;
  }

  /**
   * Get cached Excel data if not expired
   * @param tenantId The tenant ID
   * @returns Promise<string | null> Cached data or null if expired/not found
   */
  private async getCachedExcelData(tenantId: string): Promise<string | null> {
    try {
      const cacheKey = this.getCacheKey(tenantId);
      const cachedDataString = await this.tenantKnowledgeCache.get(cacheKey);

      if (!cachedDataString) {
        return null;
      }

      const cachedData: CachedExcelData = JSON.parse(cachedDataString);
      const now = Date.now();

      // Check if cache is expired
      if (now - cachedData.timestamp > this.CACHE_EXPIRY_MS) {
        console.log(`Cache expired for tenant: ${tenantId}`);
        // Optionally delete expired cache
        await this.tenantKnowledgeCache.delete(cacheKey);
        return null;
      }

      console.log(`Cache hit for tenant: ${tenantId}`);
      return cachedData.data;
    } catch (error) {
      console.error(
        `Error retrieving cached Excel data for ${tenantId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Cache Excel data with timestamp
   * @param tenantId The tenant ID
   * @param data The Excel markdown data to cache
   * @returns Promise<void>
   */
  private async cacheExcelData(tenantId: string, data: string): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(tenantId);
      const cachedData: CachedExcelData = {
        data,
        timestamp: Date.now(),
        tenantId,
      };

      await this.tenantKnowledgeCache.put(cacheKey, JSON.stringify(cachedData));
      console.log(`Cached Excel data for tenant: ${tenantId}`);
    } catch (error) {
      console.error(`Error caching Excel data for ${tenantId}:`, error);
      // Don't throw error, just log it - caching failure shouldn't break the flow
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

      // Get Excel data with caching
      const getExcelDataWithCache = async (): Promise<string> => {
        // Try to get cached data first
        const cachedData = await this.getCachedExcelData(tenantId);
        if (cachedData) {
          return cachedData;
        }

        // Cache miss or expired, fetch from Google Sheets
        console.log(
          `Cache miss for tenant: ${tenantId}, fetching from Google Sheets`
        );
        const freshData = await this.googleSheets.collectAllSheetsAsMarkdown(
          tenantConfig?.spreadsheetId
        );

        // Cache the fresh data
        await this.cacheExcelData(tenantId, freshData);
        return freshData;
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
        measurePromise(getExcelDataWithCache(), "excel-data"),
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
