import { Langfuse, observeOpenAI } from "langfuse";
import { Env, LangfusePrompt, ChatMessage } from "../types";
import OpenAI from "openai";

export class LangfuseService {
  private langfuse: Langfuse;

  constructor(env: Env) {
    // Set up global environment variables for observeOpenAI function
    // In Cloudflare Workers, we need to make these available globally
    if (typeof globalThis !== "undefined") {
      globalThis.process = globalThis.process || {};
      globalThis.process.env = globalThis.process.env || {};
      globalThis.process.env.LANGFUSE_SECRET_KEY = env.LANGFUSE_SECRET_KEY;
      globalThis.process.env.LANGFUSE_PUBLIC_KEY = env.LANGFUSE_PUBLIC_KEY;
      globalThis.process.env.LANGFUSE_HOST = env.LANGFUSE_HOST;
    }

    this.langfuse = new Langfuse({
      baseUrl: env.LANGFUSE_HOST,
      secretKey: env.LANGFUSE_SECRET_KEY,
      publicKey: env.LANGFUSE_PUBLIC_KEY,
    });
  }

  /**
   * Create an observed OpenAI client using global observeOpenAI with proper config
   */
  createObservedOpenAI(
    openaiClient: OpenAI,
    config: {
      generationName: string;
      sessionId?: string;
      userId?: string;
    }
  ): OpenAI {
    return observeOpenAI(openaiClient, config);
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
