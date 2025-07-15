import { LangfuseService } from "../services/langfuse";
import { MemoryService } from "../services/memory";
import { LangfusePrompt, SessionMemory } from "../types";
import { LangfuseTraceClient } from "langfuse";
import { TaskLLMConfig, LLM_TASK_CONFIGS } from "../config/llmConfig";

export interface TenantConfig {
  spreadsheetId: string;
  "general-prompt-config": string;
  "buttons-prompt-config": string;
  "email-prompt-config": string;
  "excel-config": string;
  // Optional API keys for LLM providers
  "openai-api-key"?: string;
  "openrouter-api-key"?: string;
  "google-ai-api-key"?: string;
  "anthropic-api-key"?: string;
}

export interface DataCollectionResult {
  prompts: {
    guestService: LangfusePrompt | null;
    buttons: LangfusePrompt | null;
    emailTool: LangfusePrompt | null;
    excel: LangfusePrompt | null;
  };
  configs: {
    guestService: TaskLLMConfig;
    buttons: TaskLLMConfig;
    emailTool: TaskLLMConfig;
    excel: TaskLLMConfig;
  };
  sessionHistory: SessionMemory;
  tenantConfig: TenantConfig | null;
}

export class DataCollectionTask {
  private langfuseService: LangfuseService;
  private memoryService: MemoryService;
  private tenantConfigKV: KVNamespace;

  constructor(
    langfuseService: LangfuseService,
    memoryService: MemoryService,
    tenantConfigKV: KVNamespace
  ) {
    this.langfuseService = langfuseService;
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
   * Parse LLM configuration from Langfuse prompt config with fallback to defaults
   * @param langfusePrompt The prompt from Langfuse
   * @param taskName The task name to get default config for
   * @returns TaskLLMConfig
   */
  private parseConfigWithFallback(
    langfusePrompt: LangfusePrompt | null,
    taskName: keyof typeof LLM_TASK_CONFIGS
  ): TaskLLMConfig {
    // Use default configuration as fallback
    const defaultConfig = LLM_TASK_CONFIGS[taskName];

    // If no prompt or no config, return default
    if (!langfusePrompt || !langfusePrompt.config) {
      return defaultConfig;
    }

    try {
      // Config is already a parsed object, cast it to TaskLLMConfig
      const parsedConfig = langfusePrompt.config as TaskLLMConfig;

      // Validate required fields exist
      if (!parsedConfig.model || !parsedConfig.provider) {
        console.warn(
          `Invalid config structure for ${taskName}, using defaults`
        );
        return defaultConfig;
      }

      return {
        model: parsedConfig.model,
        provider: parsedConfig.provider,
        temperature: parsedConfig.temperature ?? defaultConfig.temperature,
        maxTokens: parsedConfig.maxTokens ?? defaultConfig.maxTokens,
      };
    } catch (error) {
      console.warn(`Error processing config for ${taskName}:`, error);
      return defaultConfig;
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
    {
      sessionId,
      tenantId,
      trace,
    }: {
      sessionId: string;
      tenantId: string;
      trace?: LangfuseTraceClient;
    }
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
        emailToolResult,
        excelResult,
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
        measurePromise(this.langfuseService.getPrompt("email"), "email-prompt"),
        measurePromise(this.langfuseService.getPrompt("excel"), "excel-prompt"),
        measurePromise(
          this.memoryService.getSessionMemory(tenantId, sessionId),
          "session-history"
        ),
      ]);

      // Extract results and times
      const guestServicePrompt = guestServiceResult.result;
      const buttonsPrompt = buttonsResult.result;
      const emailToolPrompt = emailToolResult.result;
      const excelPrompt = excelResult.result;
      const sessionHistory = sessionHistoryResult.result;

      // Create timing metadata
      const timingMetadata = {
        guestServicePromptTime: guestServiceResult.time,
        buttonsPromptTime: buttonsResult.time,
        emailPromptTime: emailToolResult.time,
        excelPromptTime: excelResult.time,
        sessionHistoryTime: sessionHistoryResult.time,
      };

      // Extract prompts with null fallback
      const guestServicePromptValue =
        guestServicePrompt.status === "fulfilled"
          ? guestServicePrompt.value
          : null;
      const buttonsPromptValue =
        buttonsPrompt.status === "fulfilled" ? buttonsPrompt.value : null;
      const emailToolPromptValue =
        emailToolPrompt.status === "fulfilled" ? emailToolPrompt.value : null;
      const excelPromptValue =
        excelPrompt.status === "fulfilled" ? excelPrompt.value : null;

      const result = {
        prompts: {
          guestService: guestServicePromptValue,
          buttons: buttonsPromptValue,
          emailTool: emailToolPromptValue,
          excel: excelPromptValue,
        },
        configs: {
          guestService: this.parseConfigWithFallback(
            guestServicePromptValue,
            "guestServiceTask"
          ),
          buttons: this.parseConfigWithFallback(
            buttonsPromptValue,
            "buttonsTask"
          ),
          emailTool: this.parseConfigWithFallback(
            emailToolPromptValue,
            "emailTask"
          ),
          excel: this.parseConfigWithFallback(
            excelPromptValue,
            "excelSheetMatchingTask"
          ),
        },
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
