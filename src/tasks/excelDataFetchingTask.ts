import { LangfuseService } from "../services/langfuse";
import { GoogleSheets } from "../services/googleSheets";
import { LangfuseTraceClient } from "langfuse";

export interface ExcelDataFetchingInput {
  recommendedSheets: Array<{
    sheet_name: string;
    relevance_score: number;
  }>;
  tenantId: string;
  sessionId: string;
  spreadsheetId?: string;
  trace?: LangfuseTraceClient;
}

interface CachedSheetData {
  data: string;
  timestamp: number;
  tenantId: string;
  sheetName: string;
}

export interface ExcelDataFetchingOutput {
  excelData: string;
  fetchedSheets: string[];
  errors: string[];
}

export class ExcelDataFetchingTask {
  private langfuseService: LangfuseService;
  private googleSheets: GoogleSheets;
  private tenantKnowledgeCache: KVNamespace;
  private readonly CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  constructor(
    langfuseService: LangfuseService,
    googleSheets: GoogleSheets,
    tenantKnowledgeCache: KVNamespace
  ) {
    this.langfuseService = langfuseService;
    this.googleSheets = googleSheets;
    this.tenantKnowledgeCache = tenantKnowledgeCache;
  }

  /**
   * Generate cache key for a specific sheet
   * @param tenantId The tenant ID
   * @param sheetName The sheet name
   * @returns string Cache key
   */
  private getSheetCacheKey(tenantId: string, sheetName: string): string {
    return `${tenantId}:${sheetName}`;
  }

  /**
   * Check if cached sheet data exists and is not expired
   * @param tenantId The tenant ID
   * @param sheetName The sheet name
   * @returns Promise<{ data: string; isExpired: boolean } | null>
   */
  private async getCachedSheetData(
    tenantId: string,
    sheetName: string
  ): Promise<{ data: string; isExpired: boolean } | null> {
    try {
      const cacheKey = this.getSheetCacheKey(tenantId, sheetName);
      const cachedDataString = await this.tenantKnowledgeCache.get(cacheKey);

      if (!cachedDataString) {
        return null;
      }

      const cachedData: CachedSheetData = JSON.parse(cachedDataString);
      const now = Date.now();
      const isExpired = now - cachedData.timestamp > this.CACHE_EXPIRY_MS;

      return {
        data: cachedData.data,
        isExpired,
      };
    } catch (error) {
      console.error(
        `Error retrieving cached sheet data for ${tenantId}:${sheetName}:`,
        error
      );
      return null;
    }
  }

  /**
   * Fetch sheet data from Google Sheets
   * @param spreadsheetId The spreadsheet ID
   * @param sheetName The sheet name
   * @returns Promise<string>
   */
  private async fetchSheetFromGoogleSheets(
    spreadsheetId: string,
    sheetName: string
  ): Promise<string> {
    try {
      return await this.googleSheets.collectSheetAsMarkdown(
        spreadsheetId,
        sheetName
      );
    } catch (error) {
      console.error(
        `Error fetching sheet "${sheetName}" from Google Sheets:`,
        error
      );
      throw error;
    }
  }

  /**
   * Cache sheet data with timestamp
   * @param tenantId The tenant ID
   * @param sheetName The sheet name
   * @param data The sheet data to cache
   * @returns Promise<void>
   */
  private async cacheSheetData(
    tenantId: string,
    sheetName: string,
    data: string
  ): Promise<void> {
    try {
      const cacheKey = this.getSheetCacheKey(tenantId, sheetName);
      const cachedData: CachedSheetData = {
        data,
        timestamp: Date.now(),
        tenantId,
        sheetName,
      };

      await this.tenantKnowledgeCache.put(cacheKey, JSON.stringify(cachedData));
      console.log(`Cached sheet data for ${tenantId}:${sheetName}`);
    } catch (error) {
      console.error(
        `Error caching sheet data for ${tenantId}:${sheetName}:`,
        error
      );
      // Don't throw error, just log it - caching failure shouldn't break the flow
    }
  }

  /**
   * Fetch Excel data for recommended sheets
   * @param input ExcelDataFetchingInput
   * @returns Promise<ExcelDataFetchingOutput>
   */
  async execute(
    input: ExcelDataFetchingInput
  ): Promise<ExcelDataFetchingOutput> {
    // Create span for this task
    const span = input.trace
      ? this.langfuseService.createSpan(
          input.trace,
          "excel-data-fetching-task",
          {
            recommendedSheets: input.recommendedSheets,
            tenantId: input.tenantId,
          }
        )
      : null;

    const fetchedSheets: string[] = [];
    const errors: string[] = [];
    const excelDataParts: string[] = [];

    // Sort sheets by relevance score (highest first)
    const sortedSheets = input.recommendedSheets.sort(
      (a, b) => b.relevance_score - a.relevance_score
    );

    // Fetch each recommended sheet
    for (const sheet of sortedSheets) {
      try {
        // Check cache first
        const cachedData = await this.getCachedSheetData(
          input.tenantId,
          sheet.sheet_name
        );

        let sheetData: string;

        if (cachedData && !cachedData.isExpired) {
          // Use cached data if available and not expired
          sheetData = cachedData.data;
          console.log(
            `Using cached data for ${input.tenantId}:${sheet.sheet_name}`
          );
        } else {
          // Data is missing or expired, fetch from Google Sheets
          if (!input.spreadsheetId) {
            errors.push(
              `Sheet "${sheet.sheet_name}" not found in cache and no spreadsheet ID provided`
            );
            continue;
          }

          console.log(
            `Fetching fresh data for ${input.tenantId}:${sheet.sheet_name} from Google Sheets`
          );

          try {
            sheetData = await this.fetchSheetFromGoogleSheets(
              input.spreadsheetId,
              sheet.sheet_name
            );

            // Cache the fresh data
            await this.cacheSheetData(
              input.tenantId,
              sheet.sheet_name,
              sheetData
            );
          } catch (googleSheetsError) {
            // If Google Sheets fails and we have expired cached data, use it as fallback
            if (cachedData && cachedData.isExpired) {
              sheetData = cachedData.data;
              console.warn(
                `Using expired cached data for ${input.tenantId}:${sheet.sheet_name} due to Google Sheets error`
              );
            } else {
              throw googleSheetsError;
            }
          }
        }

        excelDataParts.push(`## ${sheet.sheet_name}\n${sheetData}`);
        fetchedSheets.push(sheet.sheet_name);
      } catch (error) {
        const errorMessage = `Error fetching sheet "${sheet.sheet_name}": ${error}`;
        errors.push(errorMessage);
        console.error(errorMessage);
      }
    }

    // Combine all Excel data
    const combinedExcelData = excelDataParts.join("\n\n");

    const result: ExcelDataFetchingOutput = {
      excelData: combinedExcelData || "No Excel data available",
      fetchedSheets,
      errors,
    };

    // End span with results
    if (span) {
      span.end({
        output: result,
        metadata: {
          fetchedSheetsCount: fetchedSheets.length,
          errorsCount: errors.length,
        },
      });
    }

    return result;
  }
}
