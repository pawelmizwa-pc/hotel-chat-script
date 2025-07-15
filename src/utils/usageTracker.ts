import { LLMProviderType } from "../types";

export interface DetailedUsage {
  input: number;
  output: number;
  cache_read_input_tokens?: number;
  total: number;
  [key: string]: number | undefined;
}

export interface CostDetails {
  input: number;
  cache_read_input_tokens?: number;
  output: number;
  total: number;
  [key: string]: number | undefined;
}

export interface LangfuseUsageDetails {
  usageDetails: DetailedUsage;
  costDetails: CostDetails;
}

// Pricing per 1000 tokens (in USD) - updated as of 2024
const MODEL_PRICING: Record<
  string,
  { input: number; output: number; cached?: number }
> = {
  // OpenAI models
  "gpt-4": { input: 0.03, output: 0.06 },
  "gpt-4-turbo": { input: 0.01, output: 0.03 },
  "gpt-4o": { input: 0.005, output: 0.015 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-3.5-turbo": { input: 0.0015, output: 0.002 },

  // Anthropic models
  "claude-3-opus-20240229": { input: 0.015, output: 0.075 },
  "claude-3-sonnet-20240229": { input: 0.003, output: 0.015 },
  "claude-3-haiku-20240307": { input: 0.00025, output: 0.00125 },
  "claude-3-5-sonnet-20241022": { input: 0.003, output: 0.015 },

  // Google models
  "gemini-pro": { input: 0.00025, output: 0.0005 },
  "gemini-1.5-pro": { input: 0.00125, output: 0.005 },
  "gemini-1.5-flash": { input: 0.000075, output: 0.0003 },

  // OpenRouter models (approximate pricing)
  "openai/gpt-4": { input: 0.03, output: 0.06 },
  "openai/gpt-4-turbo": { input: 0.01, output: 0.03 },
  "anthropic/claude-3-opus": { input: 0.015, output: 0.075 },
  "anthropic/claude-3-sonnet": { input: 0.003, output: 0.015 },
  "anthropic/claude-3-haiku": { input: 0.00025, output: 0.00125 },
};

/**
 * Extract base model name from full model string for pricing lookup
 */
function getBaseModelName(model: string): string {
  // Handle OpenRouter format
  if (model.includes("/")) {
    return model;
  }

  // Handle versioned models
  const baseModel = model.toLowerCase();

  // Map common model variations to base pricing keys
  if (baseModel.includes("gpt-4o-mini")) return "gpt-4o-mini";
  if (baseModel.includes("gpt-4o")) return "gpt-4o";
  if (baseModel.includes("gpt-4-turbo")) return "gpt-4-turbo";
  if (baseModel.includes("gpt-4")) return "gpt-4";
  if (baseModel.includes("gpt-3.5-turbo")) return "gpt-3.5-turbo";

  if (baseModel.includes("claude-3-5-sonnet"))
    return "claude-3-5-sonnet-20241022";
  if (baseModel.includes("claude-3-opus")) return "claude-3-opus-20240229";
  if (baseModel.includes("claude-3-sonnet")) return "claude-3-sonnet-20240229";
  if (baseModel.includes("claude-3-haiku")) return "claude-3-haiku-20240307";

  if (baseModel.includes("gemini-1.5-pro")) return "gemini-1.5-pro";
  if (baseModel.includes("gemini-1.5-flash")) return "gemini-1.5-flash";
  if (baseModel.includes("gemini-pro")) return "gemini-pro";

  return model;
}

/**
 * Calculate cost for a given number of tokens
 */
function calculateTokenCost(tokens: number, pricePerThousand: number): number {
  return (tokens / 1000) * pricePerThousand;
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

  // Get pricing for the model
  const baseModel = getBaseModelName(model);
  const pricing = MODEL_PRICING[baseModel];

  // Fallback pricing if model not found (use GPT-4o-mini as default)
  const fallbackPricing = MODEL_PRICING["gpt-4o-mini"];
  const modelPricing = pricing || fallbackPricing;

  if (!pricing) {
    console.warn(
      `Pricing not found for model ${model}, using fallback pricing`
    );
  }

  // Calculate costs
  const inputCost = calculateTokenCost(inputTokens, modelPricing.input);
  const outputCost = calculateTokenCost(outputTokens, modelPricing.output);
  const cacheCost =
    cacheReadTokens > 0
      ? calculateTokenCost(
          cacheReadTokens,
          modelPricing.cached || modelPricing.input * 0.5
        )
      : 0;
  const totalCost = inputCost + outputCost + cacheCost;

  const usageDetails: DetailedUsage = {
    input: inputTokens,
    output: outputTokens,
    total: totalTokens,
  };

  const costDetails: CostDetails = {
    input: inputCost,
    output: outputCost,
    total: totalCost,
  };

  // Add cache details if present
  if (cacheReadTokens > 0) {
    usageDetails.cache_read_input_tokens = cacheReadTokens;
    costDetails.cache_read_input_tokens = cacheCost;
  }

  return {
    usageDetails,
    costDetails,
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
    cost: `$${usage.costDetails.total.toFixed(6)}`,
  });
}
