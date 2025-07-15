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

interface GoogleAPIError extends Error {
  status?: number;
  code?: number;
  details?: string;
}

export class ExcelDataFetchingTask {
  private langfuseService: LangfuseService;
  private googleSheets: GoogleSheets;
  private tenantKnowledgeCache: KVNamespace;
  private readonly CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  private readonly MAX_RETRY_ATTEMPTS = 1;
  private readonly RETRY_DELAY_BASE_MS = 1000; // 1 second base delay

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
   * Check if error is a Google API error
   * @param error The error to check
   * @returns boolean
   */
  private isGoogleAPIError(error: any): error is GoogleAPIError {
    if (!error) return false;

    const errorMessage = error.message || String(error);
    const statusCode = error.status || error.code;

    // Check for Google API specific error patterns
    return (
      errorMessage.includes("Google API error") ||
      errorMessage.includes("Google Sheets API") ||
      errorMessage.includes("googleapis.com") ||
      statusCode === 403 ||
      statusCode === 429 ||
      statusCode === 500 ||
      statusCode === 502 ||
      statusCode === 503 ||
      statusCode === 504
    );
  }

  /**
   * Check if error is retryable
   * @param error The error to check
   * @returns boolean
   */
  private isRetryableError(error: any): boolean {
    if (!this.isGoogleAPIError(error)) return false;

    const errorMessage = error.message || String(error);
    const statusCode = error.status || error.code;

    // Don't retry on authentication/permission errors
    if (statusCode === 401 || statusCode === 403) {
      // However, 403 can sometimes be temporary quota issues, so retry once
      return errorMessage.includes("quota") || errorMessage.includes("limit");
    }

    // Retry on server errors and rate limits
    return (
      statusCode === 429 || (statusCode !== undefined && statusCode >= 500)
    );
  }

  /**
   * Create a user-friendly error message for Google API errors
   * @param error The error to format
   * @param sheetName The sheet name
   * @returns string Formatted error message
   */
  private formatGoogleAPIError(error: any, sheetName: string): string {
    const errorMessage = error.message || String(error);

    // Handle specific Google API configuration errors
    if (
      errorMessage.includes("Google Sheets API has not been used") ||
      errorMessage.includes("it is disabled")
    ) {
      return `Google Sheets API is not enabled for this project. Please enable it in the Google Cloud Console and try again. (Sheet: ${sheetName})`;
    }

    if (errorMessage.includes("403") || errorMessage.includes("Forbidden")) {
      return `Access forbidden to Google Sheets. Please check API permissions and quota limits. (Sheet: ${sheetName})`;
    }

    if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
      return `Google Sheets authentication failed. Please check API credentials. (Sheet: ${sheetName})`;
    }

    if (errorMessage.includes("quota") || errorMessage.includes("limit")) {
      return `Google Sheets API quota exceeded. Please try again later. (Sheet: ${sheetName})`;
    }

    if (errorMessage.includes("429")) {
      return `Google Sheets API rate limit exceeded. Please try again later. (Sheet: ${sheetName})`;
    }

    // Generic Google API error
    return `Google API error for sheet "${sheetName}": ${errorMessage}`;
  }

  /**
   * Sleep for specified milliseconds
   * @param ms Milliseconds to sleep
   * @returns Promise<void>
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
   * @param span Optional Langfuse span for error logging
   * @returns Promise<{ data: string; isExpired: boolean } | null>
   */
  private async getCachedSheetData(
    tenantId: string,
    sheetName: string,
    span?: any
  ): Promise<{ data: string; isExpired: boolean } | null> {
    try {
      const cacheKey = this.getSheetCacheKey(tenantId, sheetName);
      const cachedDataString = await this.tenantKnowledgeCache.get(cacheKey);

      if (!cachedDataString) {
        return null;
      }

      // Enhanced JSON parsing with specific error handling
      let cachedData: CachedSheetData;
      try {
        cachedData = JSON.parse(cachedDataString);
      } catch (parseError) {
        console.error(
          `JSON parsing error for cached sheet data ${tenantId}:${sheetName}:`,
          parseError
        );

        // Log JSON parsing error to Langfuse span with more details
        if (span) {
          try {
            span.update({
              metadata: {
                jsonParseError: {
                  message:
                    parseError instanceof Error
                      ? parseError.message
                      : String(parseError),
                  task: "ExcelDataFetchingTask",
                  tenantId,
                  sheetName,
                  operation: "getCachedSheetData - JSON.parse",
                  cachedDataLength: cachedDataString.length,
                  cachedDataPreview: cachedDataString.substring(0, 200) + "...",
                  timestamp: new Date().toISOString(),
                },
              },
            });
          } catch (logError) {
            console.warn(
              "Failed to log JSON parse error to Langfuse:",
              logError
            );
          }
        }
        return null;
      }

      // Validate the structure of parsed data
      if (!cachedData || typeof cachedData !== "object") {
        console.error(
          `Invalid cached data structure for ${tenantId}:${sheetName}: not an object`
        );

        if (span) {
          try {
            span.update({
              metadata: {
                dataValidationError: {
                  message: "Cached data is not a valid object",
                  task: "ExcelDataFetchingTask",
                  tenantId,
                  sheetName,
                  operation: "getCachedSheetData - validation",
                  cachedDataType: typeof cachedData,
                  timestamp: new Date().toISOString(),
                },
              },
            });
          } catch (logError) {
            console.warn(
              "Failed to log validation error to Langfuse:",
              logError
            );
          }
        }
        return null;
      }

      // Validate required properties
      if (!cachedData.data || typeof cachedData.data !== "string") {
        console.error(
          `Invalid cached data for ${tenantId}:${sheetName}: missing or invalid 'data' property`
        );

        if (span) {
          try {
            span.update({
              metadata: {
                dataValidationError: {
                  message: "Missing or invalid 'data' property",
                  task: "ExcelDataFetchingTask",
                  tenantId,
                  sheetName,
                  operation: "getCachedSheetData - validation",
                  hasData: !!cachedData.data,
                  dataType: typeof cachedData.data,
                  timestamp: new Date().toISOString(),
                },
              },
            });
          } catch (logError) {
            console.warn(
              "Failed to log validation error to Langfuse:",
              logError
            );
          }
        }
        return null;
      }

      if (!cachedData.timestamp || typeof cachedData.timestamp !== "number") {
        console.error(
          `Invalid cached data for ${tenantId}:${sheetName}: missing or invalid 'timestamp' property`
        );

        if (span) {
          try {
            span.update({
              metadata: {
                dataValidationError: {
                  message: "Missing or invalid 'timestamp' property",
                  task: "ExcelDataFetchingTask",
                  tenantId,
                  sheetName,
                  operation: "getCachedSheetData - validation",
                  hasTimestamp: !!cachedData.timestamp,
                  timestampType: typeof cachedData.timestamp,
                  timestamp: new Date().toISOString(),
                },
              },
            });
          } catch (logError) {
            console.warn(
              "Failed to log validation error to Langfuse:",
              logError
            );
          }
        }
        return null;
      }

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

      // Log cache retrieval error to Langfuse span
      if (span) {
        try {
          span.update({
            metadata: {
              cacheRetrievalError: {
                message: error instanceof Error ? error.message : String(error),
                task: "ExcelDataFetchingTask",
                tenantId,
                sheetName,
                operation: "getCachedSheetData - general",
                timestamp: new Date().toISOString(),
              },
            },
          });
        } catch (logError) {
          console.warn(
            "Failed to log cache retrieval error to Langfuse:",
            logError
          );
        }
      }

      return null;
    }
  }

  /**
   * Fetch sheet data from Google Sheets with retry logic
   * @param spreadsheetId The spreadsheet ID
   * @param sheetName The sheet name
   * @param retryAttempt Current retry attempt (for internal use)
   * @returns Promise<string>
   */
  private async fetchSheetFromGoogleSheets(
    spreadsheetId: string,
    sheetName: string,
    retryAttempt: number = 0
  ): Promise<string> {
    try {
      return await this.googleSheets.collectSheetAsMarkdown(
        spreadsheetId,
        sheetName
      );
    } catch (error) {
      console.error(
        `Error fetching sheet "${sheetName}" from Google Sheets (attempt ${
          retryAttempt + 1
        }):`,
        error
      );

      // If this is a retryable error and we haven't exceeded max attempts
      if (
        this.isRetryableError(error) &&
        retryAttempt < this.MAX_RETRY_ATTEMPTS
      ) {
        const delayMs = this.RETRY_DELAY_BASE_MS * Math.pow(2, retryAttempt); // Exponential backoff
        console.log(
          `Retrying in ${delayMs}ms... (attempt ${retryAttempt + 1}/${
            this.MAX_RETRY_ATTEMPTS
          })`
        );

        await this.sleep(delayMs);
        return this.fetchSheetFromGoogleSheets(
          spreadsheetId,
          sheetName,
          retryAttempt + 1
        );
      }

      // If not retryable or max attempts exceeded, throw the error
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

    try {
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
            sheet.sheet_name,
            span
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
              // Enhanced error handling for Google API errors
              const isGoogleAPIError = this.isGoogleAPIError(googleSheetsError);

              if (isGoogleAPIError) {
                console.warn(
                  `Google API error for ${input.tenantId}:${sheet.sheet_name}:`,
                  googleSheetsError
                );

                // Log Google API error details to span
                if (span) {
                  try {
                    span.update({
                      metadata: {
                        googleAPIError: {
                          message:
                            googleSheetsError instanceof Error
                              ? googleSheetsError.message
                              : String(googleSheetsError),
                          task: "ExcelDataFetchingTask",
                          sheetName: sheet.sheet_name,
                          tenantId: input.tenantId,
                          isRetryable: this.isRetryableError(googleSheetsError),
                          timestamp: new Date().toISOString(),
                        },
                      },
                    });
                  } catch (logError) {
                    console.warn(
                      "Failed to log Google API error to Langfuse:",
                      logError
                    );
                  }
                }
              }

              // Always try to use expired cached data as fallback after retry fails
              if (cachedData && cachedData.isExpired) {
                sheetData = cachedData.data;
                console.warn(
                  `Using expired cached data for ${input.tenantId}:${
                    sheet.sheet_name
                  } due to fetch error after retry (${
                    isGoogleAPIError ? "Google API error" : "fetch error"
                  })`
                );

                // Add warning to errors but don't fail completely
                const formattedError = isGoogleAPIError
                  ? this.formatGoogleAPIError(
                      googleSheetsError,
                      sheet.sheet_name
                    )
                  : `${
                      googleSheetsError instanceof Error
                        ? googleSheetsError.message
                        : String(googleSheetsError)
                    }`;

                errors.push(
                  `Warning: Using expired cached data for "${sheet.sheet_name}" due to error after retry: ${formattedError}`
                );
              } else {
                throw googleSheetsError;
              }
            }
          }

          excelDataParts.push(`## ${sheet.sheet_name}\n${sheetData.trim()}`);
          fetchedSheets.push(sheet.sheet_name);
        } catch (error) {
          const isGoogleAPIError = this.isGoogleAPIError(error);
          const errorMessage = isGoogleAPIError
            ? this.formatGoogleAPIError(error, sheet.sheet_name)
            : `Error fetching sheet "${sheet.sheet_name}": ${error}`;

          errors.push(errorMessage);
          console.error(errorMessage);

          // Log individual sheet fetch error to span metadata
          if (span) {
            try {
              span.update({
                metadata: {
                  sheetFetchError: {
                    message:
                      error instanceof Error ? error.message : String(error),
                    task: "ExcelDataFetchingTask",
                    sheetName: sheet.sheet_name,
                    isGoogleAPIError,
                    timestamp: new Date().toISOString(),
                  },
                },
              });
            } catch (logError) {
              console.warn(
                "Failed to log sheet fetch error to Langfuse:",
                logError
              );
            }
          }
        }
      }

      // Combine all Excel data
      const combinedExcelData = excelDataParts.join("\n\n").trim();

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
            hasGoogleAPIErrors: errors.some((error) =>
              error.includes("Google API error")
            ),
          },
        });
      }

      return result;
    } catch (error) {
      // Log overall task failure to span metadata
      if (span) {
        try {
          span.update({
            metadata: {
              taskError: {
                message: error instanceof Error ? error.message : String(error),
                task: "ExcelDataFetchingTask",
                timestamp: new Date().toISOString(),
              },
            },
          });

          // End span with error
          span.end({
            output: null,
            metadata: {
              failed: true,
              error: error instanceof Error ? error.message : String(error),
            },
          });
        } catch (logError) {
          console.warn("Failed to log task error to Langfuse:", logError);
        }
      }

      // Re-throw the error to maintain the original behavior
      throw error;
    }
  }
}
