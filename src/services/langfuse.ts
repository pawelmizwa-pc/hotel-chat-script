import { Langfuse, observeOpenAI } from "langfuse";
import { Env, LangfusePrompt, ChatMessage } from "../types";
import OpenAI from "openai";

export class LangfuseService {
  private langfuse: Langfuse;
  private env: Env;

  constructor(env: Env) {
    this.env = env;
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

  /**
   * Create a new trace for a chat session
   * @param sessionId The chat session ID
   * @param userId Optional user ID
   * @returns Trace object
   */
  createTrace(sessionId: string, userId?: string) {
    return this.langfuse.trace({
      sessionId,
      userId,
      name: "hotel-chat-conversation",
      metadata: {
        service: "hotel-chat-worker",
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Create a span within a trace for OpenAI calls
   * @param trace The parent trace
   * @param name The name of the span
   * @param input The input to the OpenAI call
   * @returns Span object
   */
  createSpan(trace: any, name: string, input: any) {
    return trace.span({
      name,
      input,
      startTime: new Date(),
      metadata: {
        model: "gpt-4",
        provider: "openai",
      },
    });
  }

  /**
   * Create a generation entry for OpenAI API calls
   * @param trace The parent trace
   * @param name The name of the generation
   * @param input The input messages
   * @param model The model used
   * @returns Generation object
   */
  createGeneration(
    trace: any,
    name: string,
    input: ChatMessage[],
    model: string = "gpt-4"
  ) {
    return trace.generation({
      name,
      input,
      model,
      modelParameters: {
        temperature: 0.7,
        maxTokens: 1000,
      },
      startTime: new Date(),
    });
  }

  /**
   * End a generation with the response and usage information
   * @param generation The generation object
   * @param output The response from OpenAI
   * @param usage Usage statistics
   */
  endGeneration(
    generation: any,
    output: string,
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    }
  ) {
    generation.end({
      output,
      endTime: new Date(),
      usage: usage
        ? {
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
          }
        : undefined,
    });
  }

  /**
   * Create an OpenAI wrapper that automatically traces calls
   * @param trace The parent trace
   * @returns Object with traced OpenAI methods
   */
  createOpenAITracer(trace: any) {
    const self = this;
    return {
      /**
       * Trace a chat completion call
       * @param messages The messages to send
       * @param model The model to use
       * @param temperature The temperature setting
       * @returns Promise with the response and generation object
       */
      async traceChatCompletion(
        messages: ChatMessage[],
        model: string = "gpt-4",
        temperature: number = 0.7
      ): Promise<{
        generation: any;
        startTime: number;
        messages: ChatMessage[];
        model: string;
        temperature: number;
      }> {
        const generation = self.createGeneration(
          trace,
          "chat-completion",
          messages,
          model
        );

        try {
          // This would be used with your OpenAI client
          const startTime = Date.now();

          // Return the generation object so the caller can complete it
          return {
            generation,
            startTime,
            messages,
            model,
            temperature,
          };
        } catch (error) {
          generation.end({
            output: null,
            endTime: new Date(),
            level: "ERROR",
            statusMessage:
              error instanceof Error ? error.message : "Unknown error",
          });
          throw error;
        }
      },
    };
  }

  /**
   * Log user feedback on a generation
   * @param traceId The trace ID
   * @param score Numerical score (1-5)
   * @param comment Optional comment
   */
  async logFeedback(traceId: string, score: number, comment?: string) {
    try {
      await this.langfuse.score({
        traceId,
        name: "user-feedback",
        value: score,
        comment,
      });
    } catch (error) {
      console.error("Error logging feedback:", error);
    }
  }

  /**
   * Log an event within a trace
   * @param trace The parent trace
   * @param name The event name
   * @param metadata Additional metadata
   */
  logEvent(trace: any, name: string, metadata?: Record<string, any>) {
    trace.event({
      name,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Update trace with final session information
   * @param trace The trace object
   * @param output The final response
   * @param metadata Additional metadata
   */
  endTrace(trace: any, output?: any, metadata?: Record<string, any>) {
    trace.update({
      output,
      metadata: {
        ...metadata,
        endTime: new Date().toISOString(),
      },
    });
  }

  /**
   * Flush all pending events to Langfuse
   * This is important for Cloudflare Workers to ensure events are sent
   */
  async flush() {
    try {
      await this.langfuse.flushAsync();
    } catch (error) {
      console.error("Error flushing Langfuse events:", error);
    }
  }

  /**
   * Wrap an OpenAI client with automatic Langfuse observability
   * @param openaiClient The OpenAI client to wrap
   * @param sessionId Optional session ID for grouping traces
   * @param userId Optional user ID for user-specific tracking
   * @returns OpenAI client wrapped with Langfuse observability
   */
  observeOpenAI(
    openaiClient: OpenAI,
    sessionId?: string,
    userId?: string
  ): OpenAI {
    return observeOpenAI(openaiClient, {
      generationName: "hotel-chat-completion",
      sessionId,
      userId,
    });
  }

  /**
   * Wrap an OpenAI client with automatic observability and custom trace settings
   * @param openaiClient The OpenAI client to wrap
   * @param traceId Optional trace ID to associate calls with
   * @param sessionId Optional session ID
   * @param userId Optional user ID
   * @param metadata Optional metadata to include in traces
   * @returns OpenAI client wrapped with Langfuse observability
   */
  observeOpenAIWithTrace(
    openaiClient: OpenAI,
    traceId?: string,
    sessionId?: string,
    userId?: string,
    metadata?: Record<string, any>
  ): OpenAI {
    return observeOpenAI(openaiClient, {
      generationName: "hotel-chat-completion",
      traceId,
      sessionId,
      userId,
      metadata: {
        service: "hotel-chat-worker",
        timestamp: new Date().toISOString(),
        ...metadata,
      },
    });
  }

  /**
   * Get common hotel chat prompts
   * @returns Object with commonly used prompts
   */
  async getHotelChatPrompts() {
    const prompts = await Promise.allSettled([
      this.getPrompt("hotel-welcome"),
      this.getPrompt("hotel-booking-assistant"),
      this.getPrompt("hotel-concierge"),
      this.getPrompt("hotel-problem-solver"),
    ]);

    return {
      welcome: prompts[0].status === "fulfilled" ? prompts[0].value : null,
      booking: prompts[1].status === "fulfilled" ? prompts[1].value : null,
      concierge: prompts[2].status === "fulfilled" ? prompts[2].value : null,
      problemSolver:
        prompts[3].status === "fulfilled" ? prompts[3].value : null,
    };
  }

  /**
   * Create a complete conversation trace with automatic OpenAI monitoring
   * @param sessionId The session ID
   * @param userMessage The user's message
   * @param systemPrompt The system prompt used
   * @returns Trace and generation objects for completing the flow
   */
  async startConversationTrace(
    sessionId: string,
    userMessage: string,
    systemPrompt?: string
  ) {
    const trace = this.createTrace(sessionId);

    this.logEvent(trace, "conversation-start", {
      userMessage,
      systemPrompt: systemPrompt ? "present" : "none",
    });

    const messages: ChatMessage[] = [];
    if (systemPrompt) {
      messages.push({
        role: "system",
        content: systemPrompt,
        timestamp: Date.now(),
      });
    }
    messages.push({
      role: "user",
      content: userMessage,
      timestamp: Date.now(),
    });

    const tracer = this.createOpenAITracer(trace);
    const generationData = await tracer.traceChatCompletion(messages);

    return {
      trace,
      generationData,
      completeConversation: (
        response: string,
        usage?: {
          promptTokens?: number;
          completionTokens?: number;
          totalTokens?: number;
        }
      ) => {
        this.endGeneration(generationData.generation, response, usage);
        this.logEvent(trace, "conversation-complete", {
          responseLength: response.length,
          usage,
        });
        this.endTrace(trace, response, {
          conversationComplete: true,
          sessionId,
        });
      },
    };
  }
}
