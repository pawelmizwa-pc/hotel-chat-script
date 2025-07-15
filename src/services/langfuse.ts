import {
  Langfuse,
  LangfuseSpanClient,
  LangfuseTraceClient,
  LangfuseGenerationClient,
} from "langfuse";
import { Env, LangfusePrompt } from "../types";
import { extractModelNameForLangfuse } from "../utils/llmResultParser";
import { LangfuseUsageDetails } from "../utils/usageTracker";

export class LangfuseService {
  private langfuse: Langfuse;

  constructor(env: Env) {
    this.langfuse = new Langfuse({
      baseUrl: env.LANGFUSE_HOST,
      secretKey: env.LANGFUSE_SECRET_KEY,
      publicKey: env.LANGFUSE_PUBLIC_KEY,
    });
  }

  /**
   * Create a trace for the entire request
   */
  createTrace(sessionId: string, input: any) {
    return this.langfuse.trace({
      sessionId,
      userId: sessionId,
      name: "hotel-chat-request",
      input,
    });
  }

  /**
   * Create a span for a specific task
   */
  createSpan(
    trace: LangfuseTraceClient,
    name: string,
    input: any
  ): LangfuseSpanClient {
    return trace.span({
      name,
      input,
    });
  }

  /**
   * Create a generation for LLM calls
   */
  createGeneration(
    trace: LangfuseTraceClient,
    name: string,
    input: any,
    model?: string
  ): LangfuseGenerationClient {
    return trace.generation({
      name,
      input,
      model: model ? extractModelNameForLangfuse(model) : undefined,
    });
  }

  /**
   * End a generation with detailed usage tracking
   */
  endGenerationWithUsage(
    generation: LangfuseGenerationClient,
    output: any,
    usageDetails?: LangfuseUsageDetails
  ): void {
    if (usageDetails) {
      generation.end({
        output,
        usage: {
          input: usageDetails.usageDetails.input,
          output: usageDetails.usageDetails.output,
          total: usageDetails.usageDetails.total,
        },
      });
    } else {
      generation.end({ output });
    }
  }

  /**
   * Get a prompt from Langfuse by name
   * @param promptName The name of the prompt to retrieve
   * @param version Optional version number, defaults to latest
   * @returns Promise<LangfusePrompt | null>
   */
  async getPrompt(
    promptName: string,
    version?: number
  ): Promise<LangfusePrompt | null> {
    try {
      const prompt = await this.langfuse.getPrompt(promptName, version);
      if (!prompt) {
        console.warn(`Prompt ${promptName} not found`);
        return null;
      }

      return {
        prompt: prompt.prompt,
        config: prompt.config || {},
      };
    } catch (error) {
      console.error(`Error fetching prompt ${promptName}:`, error);
      return null;
    }
  }

  async flush() {
    await this.langfuse.flushAsync();
  }
}
