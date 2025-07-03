import { Langfuse, observeOpenAI } from "langfuse";
import { Env, LangfusePrompt, ChatMessage } from "../types";
import OpenAI from "openai";

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
