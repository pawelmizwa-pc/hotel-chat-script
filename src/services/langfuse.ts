import {
  Langfuse,
  LangfuseSpanClient,
  LangfuseTraceClient,
  LangfuseGenerationClient,
} from "langfuse";
import { Env, LangfusePrompt, UTMTracking } from "../types";
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
   * Create a trace for the entire request with optional UTM tracking
   */
  createTrace(sessionId: string, input: any, utmTracking?: UTMTracking) {
    const traceData: any = {
      sessionId,
      userId: sessionId,
      name: "hotel-chat-request",
      input,
    };

    // Add UTM tracking data to trace metadata if available
    if (utmTracking) {
      traceData.metadata = {
        utmTracking,
        hasMarketingData: true,
        trackingTimestamp: new Date().toISOString(),
      };

      // Add UTM data as tags for easier filtering in Langfuse
      traceData.tags = [
        utmTracking.utm_source && `source:${utmTracking.utm_source}`,
        utmTracking.utm_medium && `medium:${utmTracking.utm_medium}`,
        utmTracking.utm_campaign && `campaign:${utmTracking.utm_campaign}`,
        utmTracking.utm_term && `term:${utmTracking.utm_term}`,
        utmTracking.utm_content && `content:${utmTracking.utm_content}`,
        utmTracking.gclid && `gclid:present`,
        utmTracking.fbclid && `fbclid:present`,
        utmTracking.msclkid && `msclkid:present`,
      ].filter(Boolean); // Remove falsy values
    }

    return this.langfuse.trace(traceData);
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
   * Create a marketing/conversion event with UTM context
   */
  createMarketingEvent(
    trace: LangfuseTraceClient,
    eventName: string,
    eventData: any,
    utmContext?: UTMTracking
  ): LangfuseSpanClient {
    const eventMetadata: any = {
      eventType: "marketing",
      eventName,
      timestamp: new Date().toISOString(),
    };

    if (utmContext) {
      eventMetadata.utmContext = utmContext;
      eventMetadata.marketingAttribution = {
        source: utmContext.utm_source,
        medium: utmContext.utm_medium,
        campaign: utmContext.utm_campaign,
      };
    }

    return trace.span({
      name: `marketing-event-${eventName}`,
      input: eventData,
      metadata: eventMetadata,
    });
  }

  /**
   * Log conversion events (email sends, bookings, etc.) with UTM attribution
   */
  logConversion(
    trace: LangfuseTraceClient,
    conversionType: string,
    conversionValue?: number,
    utmContext?: UTMTracking
  ): void {
    const conversionEvent = this.createMarketingEvent(
      trace,
      `conversion-${conversionType}`,
      {
        conversionType,
        conversionValue,
        conversionTimestamp: new Date().toISOString(),
      },
      utmContext
    );

    conversionEvent.end({
      output: {
        success: true,
        conversionType,
        value: conversionValue,
      },
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
