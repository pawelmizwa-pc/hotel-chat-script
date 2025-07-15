import {
  Langfuse,
  LangfuseSpanClient,
  LangfuseTraceClient,
  LangfuseGenerationClient,
} from "langfuse";
import { Env, LangfusePrompt, UTMTracking, ButtonInteraction } from "../types";
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
   * Create a trace for the entire request with optional UTM tracking and button interaction
   */
  createTrace(
    sessionId: string,
    input: any,
    utmTracking?: UTMTracking,
    buttonInteraction?: ButtonInteraction
  ) {
    const traceData: any = {
      sessionId,
      userId: sessionId,
      name: "hotel-chat-request",
      input,
    };

    // Initialize metadata and tags
    traceData.metadata = {};
    traceData.tags = [];

    // Add UTM tracking data to trace metadata if available
    if (utmTracking) {
      traceData.metadata.utmTracking = utmTracking;
      traceData.metadata.hasMarketingData = true;
      traceData.metadata.trackingTimestamp = new Date().toISOString();

      // Add UTM data as tags for easier filtering in Langfuse
      const utmTags = [
        utmTracking.utm_source && `source:${utmTracking.utm_source}`,
        utmTracking.utm_medium && `medium:${utmTracking.utm_medium}`,
        utmTracking.utm_campaign && `campaign:${utmTracking.utm_campaign}`,
        utmTracking.utm_term && `term:${utmTracking.utm_term}`,
        utmTracking.utm_content && `content:${utmTracking.utm_content}`,
        utmTracking.gclid && `gclid:present`,
        utmTracking.fbclid && `fbclid:present`,
        utmTracking.msclkid && `msclkid:present`,
      ].filter(Boolean);

      traceData.tags.push(...utmTags);
    }

    // Add button interaction data if available
    if (buttonInteraction && buttonInteraction.buttonClicked) {
      traceData.metadata.buttonInteraction = buttonInteraction;
      traceData.metadata.hasButtonInteraction = true;
      traceData.metadata.interactionTimestamp = new Date().toISOString();

      // Add button interaction tags for easier filtering
      const buttonTags = [
        `button-clicked:true`,
        `button-type:${buttonInteraction.buttonType}`,
        `message-type:${buttonInteraction.messageType}`,
        buttonInteraction.isUpsell && `upsell:true`,
        `button-title:${buttonInteraction.buttonTitle
          .replace(/[^a-zA-Z0-9]/g, "-")
          .toLowerCase()}`,
      ].filter(Boolean);

      traceData.tags.push(...buttonTags);
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
   * Log button interaction events with context
   */
  logButtonInteraction(
    trace: LangfuseTraceClient,
    buttonInteraction: ButtonInteraction,
    responseGenerated?: boolean
  ): LangfuseSpanClient {
    const interactionEvent = trace.span({
      name: `button-interaction-${buttonInteraction.buttonType}`,
      input: {
        buttonTitle: buttonInteraction.buttonTitle,
        buttonType: buttonInteraction.buttonType,
        messageType: buttonInteraction.messageType,
        buttonPayload: buttonInteraction.buttonPayload,
        isUpsell: buttonInteraction.isUpsell,
      },
      metadata: {
        eventType: "button-interaction",
        buttonClicked: buttonInteraction.buttonClicked,
        clickTimestamp:
          buttonInteraction.clickTimestamp || new Date().toISOString(),
        previousMessageId: buttonInteraction.previousMessageId,
        responseGenerated: responseGenerated || false,
      },
    });

    interactionEvent.end({
      output: {
        interactionProcessed: true,
        buttonTitle: buttonInteraction.buttonTitle,
        isUpsell: buttonInteraction.isUpsell,
      },
    });

    return interactionEvent;
  }

  /**
   * Log upsell events when upsell buttons are clicked
   */
  logUpsellEvent(
    trace: LangfuseTraceClient,
    upsellData: {
      buttonTitle: string;
      upsellType: string;
      potentialValue?: number;
    },
    utmContext?: UTMTracking
  ): void {
    const upsellEvent = this.createMarketingEvent(
      trace,
      `upsell-${upsellData.upsellType}`,
      {
        buttonTitle: upsellData.buttonTitle,
        upsellType: upsellData.upsellType,
        potentialValue: upsellData.potentialValue,
        upsellTimestamp: new Date().toISOString(),
      },
      utmContext
    );

    upsellEvent.end({
      output: {
        success: true,
        upsellType: upsellData.upsellType,
        potentialValue: upsellData.potentialValue,
      },
    });
  }

  /**
   * Track button engagement metrics
   */
  trackButtonEngagement(
    trace: LangfuseTraceClient,
    engagementData: {
      totalButtons: number;
      buttonsClicked: number;
      engagementRate: number;
      sessionDuration?: number;
    }
  ): void {
    const engagementEvent = trace.span({
      name: "button-engagement-metrics",
      input: engagementData,
      metadata: {
        eventType: "engagement-analysis",
        timestamp: new Date().toISOString(),
      },
    });

    engagementEvent.end({
      output: {
        engagementAnalysis: engagementData,
        highEngagement: engagementData.engagementRate > 0.5,
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
