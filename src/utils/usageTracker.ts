import { LLMProviderType } from "../types";

export interface DetailedUsage {
  input: number;
  output: number;
  cache_read_input_tokens?: number;
  total: number;
  [key: string]: number | undefined;
}

export interface LangfuseUsageDetails {
  usageDetails: DetailedUsage;
}

/**
 * Create detailed usage tracking for Langfuse
 */
export function createUsageDetails(
  inputTokens: number,
  outputTokens: number,
  model: string,
  provider: LLMProviderType,
  cacheReadTokens: number = 0
): LangfuseUsageDetails {
  const totalTokens = inputTokens + outputTokens + cacheReadTokens;

  const usageDetails: DetailedUsage = {
    input: inputTokens,
    output: outputTokens,
    total: totalTokens,
  };

  // Add cache details if present
  if (cacheReadTokens > 0) {
    usageDetails.cache_read_input_tokens = cacheReadTokens;
  }

  return {
    usageDetails,
  };
}

/**
 * Convert simple usage to detailed usage format
 */
export function convertToDetailedUsage(
  usage:
    | {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      }
    | undefined,
  model: string,
  provider: LLMProviderType,
  cacheReadTokens: number = 0
): LangfuseUsageDetails | undefined {
  if (!usage) {
    return undefined;
  }

  return createUsageDetails(
    usage.promptTokens,
    usage.completionTokens,
    model,
    provider,
    cacheReadTokens
  );
}

/**
 * Log usage details for debugging
 */
export function logUsageDetails(
  taskName: string,
  usage: LangfuseUsageDetails,
  model: string
): void {
  console.log(`[${taskName}] Usage for ${model}:`, {
    tokens: usage.usageDetails,
  });
}
