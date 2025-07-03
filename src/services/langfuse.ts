import { Langfuse, observeOpenAI } from "langfuse";
import { Env, LangfusePrompt } from "../types";

export class LangfuseService {
  private langfuse: Langfuse;

  constructor(env: Env) {
    this.langfuse = new Langfuse({
      secretKey: env.LANGFUSE_SECRET_KEY,
      publicKey: env.LANGFUSE_PUBLIC_KEY,
      baseUrl: env.LANGFUSE_HOST,
      // Enable OpenAI integration for automatic token tracking
      flushAt: 1, // Flush events immediately (important for Cloudflare Workers)
    });
  }

  // Get the Langfuse client instance for direct usage
  getClient(): Langfuse {
    return this.langfuse;
  }

  // Create an observed OpenAI model instance with automatic tracking
  createObservedOpenAI<T extends object>(
    model: T,
    config: {
      generationName: string;
      metadata?: Record<string, any>;
    }
  ) {
    return observeOpenAI(model, {
      generationName: config.generationName,
      metadata: {
        service: "hotel-chat-agent",
        timestamp: new Date().toISOString(),
        ...config.metadata,
      },
    });
  }

  // Get a specific prompt from Langfuse with observe tracking
  async getPrompt(
    promptName: string,
    sessionId?: string
  ): Promise<LangfusePrompt> {
    try {
      // Create prompt fetch trace
      const trace = this.langfuse.trace({
        name: "prompt-fetch",
        input: { promptName },
        metadata: {
          sessionId: sessionId || "unknown",
          service: "hotel-chat-agent",
          timestamp: new Date().toISOString(),
        },
      });

      const prompt = await this.langfuse.getPrompt(promptName);

      // Log successful prompt fetch
      trace.update({
        output: {
          promptFound: true,
          promptLength: prompt.prompt?.length || 0,
          hasConfig: !!prompt.config,
        },
        metadata: {
          promptName,
          version: prompt.version || "latest",
          success: true,
        },
      });

      // Track prompt usage
      this.langfuse.event({
        name: "prompt-used",
        input: { promptName },
        metadata: {
          sessionId: sessionId || "unknown",
          promptName,
          version: prompt.version || "latest",
          timestamp: new Date().toISOString(),
        },
      });

      return {
        prompt: prompt.prompt,
        config: prompt.config || {},
      };
    } catch (error) {
      console.warn(
        `Failed to fetch prompt ${promptName}, using fallback:`,
        error
      );

      // Log prompt fetch failure
      this.langfuse.event({
        name: "prompt-fallback",
        input: { promptName },
        metadata: {
          sessionId: sessionId || "unknown",
          promptName,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        },
      });

      return this.getFallbackPrompt(promptName);
    }
  }

  // Observe prompt execution with LLM generation tracking
  async observePromptExecution(
    promptName: string,
    input: string,
    output: string,
    sessionId: string,
    metadata?: Record<string, any>
  ) {
    return this.langfuse.generation({
      name: `prompt-execution-${promptName}`,
      input: input,
      output: output,
      model: metadata?.model || "gpt-4o-mini",
      metadata: {
        promptName,
        sessionId,
        service: "hotel-chat-agent",
        timestamp: new Date().toISOString(),
        ...metadata,
      },
    });
  }

  // Track prompt performance and effectiveness
  async trackPromptPerformance(
    promptName: string,
    sessionId: string,
    performance: {
      responseTime: number;
      tokenUsage?: number;
      success: boolean;
      userSatisfaction?: number;
    }
  ) {
    return this.langfuse.event({
      name: "prompt-performance",
      metadata: {
        promptName,
        sessionId,
        ...performance,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Create a new trace for conversation tracking
  createTrace(sessionId: string, input: string) {
    return this.langfuse.trace({
      id: `trace-${sessionId}-${Date.now()}`,
      sessionId: sessionId,
      input: input,
      metadata: {
        service: "hotel-chat-agent",
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Log a user message
  logUserMessage(sessionId: string, message: string) {
    return this.langfuse.event({
      name: "user-message",
      input: message,
      metadata: {
        sessionId: sessionId,
        role: "user",
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Log assistant response
  logAssistantResponse(
    sessionId: string,
    response: string,
    tokensUsed?: number
  ) {
    return this.langfuse.event({
      name: "assistant-response",
      output: response,
      metadata: {
        sessionId: sessionId,
        role: "assistant",
        tokensUsed: tokensUsed,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Log tool usage
  logToolUsage(
    sessionId: string,
    toolName: string,
    input: string,
    output: string
  ) {
    return this.langfuse.event({
      name: "tool-usage",
      input: input,
      output: output,
      metadata: {
        sessionId: sessionId,
        toolName: toolName,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Log errors
  logError(sessionId: string, error: string, context?: any) {
    return this.langfuse.event({
      name: "error",
      level: "ERROR",
      metadata: {
        sessionId: sessionId,
        error: error,
        context: context,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Flush pending events (important for Cloudflare Workers)
  async flush() {
    await this.langfuse.flushAsync();
  }

  // Shutdown the client
  async shutdown() {
    await this.langfuse.shutdownAsync();
  }

  private getFallbackPrompt(promptName: string): LangfusePrompt {
    const fallbackPrompts: Record<string, string> = {
      "guest-service": `Jesteś Zosia, wirtualnym asystentem Hotelu Smile. Odpowiadasz w języku polskim na pytania gości dotyczące hotelu, jego usług i atrakcji w okolicy.

Główne informacje o hotelu:
- Hotel Smile to nowoczesny hotel z basenem, SPA i restauracją
- Śniadania serwowane codziennie 7:00-10:30
- Hasło WiFi: SmileGuest2024
- Basen czynny: 8:00-22:00
- SPA oferuje masaże relaksacyjne, aromaterapię i zabiegi odnowy biologicznej

Bądź pomocna, przyjazna i profesjonalna. Jeśli nie masz informacji, skieruj gościa do recepcji.`,

      buttons: `Na podstawie rozmowy z gościem, wygeneruj maksymalnie 4 przydatne przyciski szybkich akcji w formacie JSON.

Przykładowe przyciski:
- Hasło WiFi (payload: "1")
- Godziny śniadań (payload: "2") 
- Oferta SPA (payload: "3")
- Informacje o basenie (payload: "pool")
- Atrakcje w okolicy (payload: "attractions")
- Kontakt z recepcją (payload: "contact")

Zwróć odpowiedź w formacie:
{"result": [{"title": "Nazwa przycisku", "payload": "wartość"}]}`,

      "knowledge-base-tool": `To narzędzie pozwala przeszukiwać bazę wiedzy hotelu w Google Sheets. Użyj go, gdy gość pyta o szczegółowe informacje dotyczące usług hotelowych, cennika, godzin otwarcia czy atrakcji lokalnych.`,
    };

    return {
      prompt:
        fallbackPrompts[promptName] || `Fallback prompt for ${promptName}`,
      config: {},
    };
  }

  async getAllPrompts(sessionId?: string): Promise<{
    guestService: LangfusePrompt;
    buttons: LangfusePrompt;
    knowledgeBaseTool: LangfusePrompt;
  }> {
    try {
      // Track batch prompt fetching
      const batchTrace = this.langfuse.trace({
        name: "prompts-batch-fetch",
        input: {
          promptNames: ["guest-service", "buttons", "knowledge-base-tool"],
        },
        metadata: {
          sessionId: sessionId || "unknown",
          service: "hotel-chat-agent",
          timestamp: new Date().toISOString(),
        },
      });

      const [guestService, buttons, knowledgeBaseTool] = await Promise.all([
        this.getPrompt("guest-service", sessionId),
        this.getPrompt("buttons", sessionId),
        this.getPrompt("knowledge-base-tool", sessionId),
      ]);

      // Update batch trace with success
      batchTrace.update({
        output: {
          fetchedPrompts: 3,
          success: true,
        },
        metadata: {
          allPromptsLoaded: true,
          timestamp: new Date().toISOString(),
        },
      });

      return {
        guestService,
        buttons,
        knowledgeBaseTool,
      };
    } catch (error) {
      console.error("Error fetching all prompts:", error);

      // Log batch fetch error
      this.langfuse.event({
        name: "prompts-batch-error",
        metadata: {
          sessionId: sessionId || "unknown",
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        },
      });

      // Return all fallback prompts
      return {
        guestService: this.getFallbackPrompt("guest-service"),
        buttons: this.getFallbackPrompt("buttons"),
        knowledgeBaseTool: this.getFallbackPrompt("knowledge-base-tool"),
      };
    }
  }
}
