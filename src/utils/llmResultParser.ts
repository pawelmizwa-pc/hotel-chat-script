/**
 * Extracts the model name from provider/model format for Langfuse compatibility
 * OpenRouter models have format "provider/model-name" but Langfuse expects just "model-name"
 * @param modelName - The full model name (e.g., "tngtech/deepseek-r1t2-chimera:free")
 * @returns The model name without provider prefix (e.g., "deepseek-r1t2-chimera:free")
 */
export function extractModelNameForLangfuse(modelName: string): string {
  // Check if the model name contains a provider prefix (format: provider/model-name)
  if (modelName.includes("/")) {
    // Split by '/' and return the part after the last '/'
    const parts = modelName.split("/");
    return parts[parts.length - 1];
  }

  // If no provider prefix, return as-is
  return modelName;
}

/**
 * Generic utility function to parse LLM responses that contain JSON data
 * @param content - The raw content from LLM response
 * @param fallback - Default value to return if parsing fails
 * @param onError - Optional callback for handling parsing errors (e.g., logging to Langfuse)
 * @returns Parsed JSON object or fallback value
 */
export function parseLLMResult<T>(
  content: string,
  fallback: T,
  onError?: (error: Error, content: string) => void
): T {
  try {
    // Clean the content by removing markdown code blocks and extra whitespace
    let cleanContent = content.trim();

    // Remove markdown code blocks if present
    const jsonMatch = cleanContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      cleanContent = jsonMatch[1];
    }

    // Extract JSON if it's wrapped in other text
    const jsonObjectMatch = cleanContent.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch) {
      cleanContent = jsonObjectMatch[0];
    }

    const parsedData = JSON.parse(cleanContent);
    return parsedData as T;
  } catch (error) {
    const parseError =
      error instanceof Error ? error : new Error(String(error));

    // Log to console
    console.warn("Failed to parse LLM result:", parseError);
    console.warn("Original content:", content);

    // Call optional error callback (e.g., for Langfuse logging)
    if (onError) {
      onError(parseError, content);
    }

    return fallback;
  }
}
