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
 * Attempts to repair incomplete JSON by fixing common truncation issues
 * @param jsonStr - The potentially incomplete JSON string
 * @returns Repaired JSON string or null if irreparable
 */
function repairIncompleteJson(jsonStr: string): string | null {
  try {
    // First, try parsing as-is
    JSON.parse(jsonStr);
    return jsonStr;
  } catch {
    // If it fails, try to repair it
    let repaired = jsonStr.trim();

    // Count braces and brackets to see what's missing
    const openBraces = (repaired.match(/\{/g) || []).length;
    const closeBraces = (repaired.match(/\}/g) || []).length;
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;

    // Check if the last character is incomplete (like an unfinished string)
    if (repaired.endsWith('"') === false && repaired.includes('"')) {
      // Find the last opening quote that doesn't have a closing quote
      const lastOpenQuote = repaired.lastIndexOf('"');
      if (lastOpenQuote !== -1) {
        // Check if this quote is opening a property value
        const beforeQuote = repaired.substring(0, lastOpenQuote);
        const colonIndex = beforeQuote.lastIndexOf(":");
        const commaIndex = beforeQuote.lastIndexOf(",");

        if (colonIndex > commaIndex) {
          // This looks like an incomplete string value, close it
          repaired += '"';
        }
      }
    }

    // Close missing brackets
    for (let i = 0; i < openBrackets - closeBrackets; i++) {
      repaired += "]";
    }

    // Close missing braces
    for (let i = 0; i < openBraces - closeBraces; i++) {
      repaired += "}";
    }

    // Try parsing the repaired version
    try {
      JSON.parse(repaired);
      return repaired;
    } catch {
      return null;
    }
  }
}

/**
 * Extracts partial data from malformed JSON using regex patterns
 * @param content - The malformed JSON content
 * @param expectedFields - Array of field names to extract
 * @returns Partial object with extracted fields
 */
function extractPartialJsonData(
  content: string,
  expectedFields: string[]
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const field of expectedFields) {
    // Try to extract boolean values
    const boolPattern = new RegExp(`"${field}"\\s*:\\s*(true|false)`, "i");
    const boolMatch = content.match(boolPattern);
    if (boolMatch) {
      result[field] = boolMatch[1].toLowerCase() === "true";
      continue;
    }

    // Try to extract string values (including incomplete ones)
    const stringPattern = new RegExp(`"${field}"\\s*:\\s*"([^"]*)"?`, "i");
    const stringMatch = content.match(stringPattern);
    if (stringMatch) {
      result[field] = stringMatch[1];
      continue;
    }

    // Try to extract number values
    const numberPattern = new RegExp(`"${field}"\\s*:\\s*([0-9.-]+)`, "i");
    const numberMatch = content.match(numberPattern);
    if (numberMatch) {
      result[field] = parseFloat(numberMatch[1]);
      continue;
    }
  }

  return result;
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

    // First, try normal parsing
    try {
      const parsedData = JSON.parse(cleanContent);
      return parsedData as T;
    } catch (parseError) {
      // Try to repair incomplete JSON
      const repairedJson = repairIncompleteJson(cleanContent);
      if (repairedJson) {
        const parsedData = JSON.parse(repairedJson);
        console.log("Successfully repaired incomplete JSON");
        return parsedData as T;
      }

      // If repair fails, try to extract partial data
      const expectedFields = Object.keys(fallback as any);
      const partialData = extractPartialJsonData(cleanContent, expectedFields);

      if (Object.keys(partialData).length > 0) {
        console.log("Extracted partial data from malformed JSON:", partialData);
        // Merge partial data with fallback
        const result = { ...fallback, ...partialData };
        return result as T;
      }

      // If all else fails, throw the original error
      throw parseError;
    }
  } catch (error) {
    const parseError =
      error instanceof Error ? error : new Error(String(error));

    // Log to console with more detail
    console.warn("Failed to parse LLM result:", parseError.message);
    console.warn("Original content:", content);
    console.warn("Using fallback values");

    // Call optional error callback (e.g., for Langfuse logging)
    if (onError) {
      onError(parseError, content);
    }

    return fallback;
  }
}
