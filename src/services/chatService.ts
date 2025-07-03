import OpenAI from "openai";
import { LangfuseService } from "./langfuse";
import { MemoryService } from "./memory";
import { GoogleSheetsKnowledgeBaseTool } from "../tools/googleSheets";
import { Env } from "../types";

export class ChatService {
  private openai: OpenAI;
  private langfuse: LangfuseService;
  private memory: MemoryService;
  private env: Env;
  private googleSheetsTool: GoogleSheetsKnowledgeBaseTool;

  constructor(env: Env) {
    this.env = env;
    this.openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
    this.langfuse = new LangfuseService(env);
    this.memory = new MemoryService(env);
    this.googleSheetsTool = new GoogleSheetsKnowledgeBaseTool(
      env,
      "Knowledge base search tool for hotel information"
    );
  }

  async processMessage(
    message: string,
    sessionId: string,
    conversationHistory: { role: string; content: string }[]
  ): Promise<{ response: string; quickActions: any[] }> {
    // Create main conversation trace
    const trace = this.langfuse.createTrace(sessionId, message);

    try {
      // Log user message
      this.langfuse.logUserMessage(sessionId, message);

      // Get conversation history from memory
      const memoryMessages = await this.memory.getConversationHistory(
        sessionId
      );
      const recentMessages = memoryMessages.slice(-10); // Keep last 10 messages

      // Create observed OpenAI instances for automatic token tracking
      const observedOpenAI = this.langfuse.createObservedOpenAI(this.openai, {
        generationName: "main-chat-completion",
        metadata: {
          sessionId,
          model: "gpt-4o-mini",
          temperature: 0,
          purpose: "main-chat-response",
        },
      });

      const observedOpenAIButtons = this.langfuse.createObservedOpenAI(
        this.openai,
        {
          generationName: "button-generation",
          metadata: {
            sessionId,
            model: "gpt-4o-mini",
            temperature: 0,
            purpose: "quick-action-buttons",
          },
        }
      );

      // Get all prompts from Langfuse with observability
      const prompts = await this.langfuse.getAllPrompts(sessionId);

      // Check if we need to use knowledge base
      const shouldUseKnowledgeBase = await this.shouldUseKnowledgeBase(
        message,
        sessionId
      );

      let knowledgeContext = "";
      if (shouldUseKnowledgeBase) {
        try {
          const knowledgeResults = await this.googleSheetsTool._call(message);
          knowledgeContext = knowledgeResults
            ? `\n\nRelevant information from hotel database:\n${knowledgeResults}`
            : "";

          // Log knowledge base usage
          this.langfuse.logToolUsage(
            sessionId,
            "knowledge-base",
            message,
            knowledgeContext
          );
        } catch (error) {
          console.error("Knowledge base error:", error);
          this.langfuse.logError(
            sessionId,
            `Knowledge base error: ${
              error instanceof Error ? error.message : String(error)
            }`,
            { tool: "knowledge-base" }
          );
        }
      }

      // Prepare messages for OpenAI
      const systemMessage = `${prompts.guestService.prompt}${knowledgeContext}`;
      const messages = [
        { role: "system", content: systemMessage },
        ...this.memory.formatMessagesForLangChain(recentMessages),
        { role: "user", content: message },
      ];

      // Get response from OpenAI with automatic token tracking
      const response = await observedOpenAI.chat.completions.create({
        model: "gpt-4o-mini",
        messages: messages as any,
        temperature: 0,
        max_tokens: 1000,
      });

      const assistantMessage = response.choices[0]?.message?.content || "";

      // Store message in memory
      await this.memory.addMessage(sessionId, {
        role: "user",
        content: message,
        timestamp: Date.now(),
      });
      await this.memory.addMessage(sessionId, {
        role: "assistant",
        content: assistantMessage,
        timestamp: Date.now(),
      });

      // Generate quick action buttons with automatic token tracking
      const quickActions = await this.generateQuickActions(
        observedOpenAIButtons,
        message,
        assistantMessage,
        sessionId,
        prompts.buttons.prompt
      );

      // Log assistant response
      this.langfuse.logAssistantResponse(
        sessionId,
        assistantMessage,
        response.usage?.total_tokens
      );

      // Update trace with success
      trace.update({
        output: {
          response: assistantMessage,
          quickActions,
          knowledgeUsed: shouldUseKnowledgeBase,
        },
        metadata: {
          success: true,
          responseLength: assistantMessage.length,
          buttonsGenerated: quickActions.length,
        },
      });

      // Flush events immediately (important for Cloudflare Workers)
      await this.langfuse.flush();

      return {
        response: assistantMessage,
        quickActions,
      };
    } catch (error) {
      console.error("Chat processing error:", error);

      // Log error with context
      this.langfuse.logError(
        sessionId,
        `Chat processing error: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { message, conversationHistory }
      );

      // Update trace with error
      trace.update({
        output: null,
        metadata: {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      // Flush events even on error
      await this.langfuse.flush();

      return {
        response:
          "Przepraszam, wystąpił problem podczas przetwarzania Twojej wiadomości. Spróbuj ponownie lub skontaktuj się z recepcją.",
        quickActions: [
          { title: "Kontakt z recepcją", payload: "contact" },
          { title: "Spróbuj ponownie", payload: "retry" },
        ],
      };
    }
  }

  private async shouldUseKnowledgeBase(
    message: string,
    sessionId: string
  ): Promise<boolean> {
    try {
      // Get knowledge base tool prompt
      const knowledgeToolPrompt = await this.langfuse.getPrompt(
        "knowledge-base-tool",
        sessionId
      );

      // Create observed OpenAI for knowledge base decision
      const observedOpenAI = this.langfuse.createObservedOpenAI(this.openai, {
        generationName: "knowledge-base-decision",
        metadata: {
          sessionId,
          model: "gpt-4o-mini",
          temperature: 0,
          purpose: "knowledge-base-decision",
        },
      });

      const response = await observedOpenAI.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `${knowledgeToolPrompt.prompt}

Determine if the user's message requires searching the hotel's knowledge base. Return only "YES" or "NO".

Examples:
- Questions about prices, specific services, detailed information about amenities: YES
- Simple greetings, general conversation, already answered questions: NO`,
          },
          { role: "user", content: message },
        ],
        temperature: 0,
        max_tokens: 10,
      });

      const decision = response.choices[0]?.message?.content
        ?.trim()
        .toUpperCase();
      const shouldUse = decision === "YES";

      // Log knowledge base decision
      this.langfuse.logToolUsage(
        sessionId,
        "knowledge-base-decision",
        message,
        `Decision: ${decision}, Should use: ${shouldUse}`
      );

      return shouldUse;
    } catch (error) {
      console.error("Knowledge base decision error:", error);
      this.langfuse.logError(
        sessionId,
        `Knowledge base decision error: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { tool: "knowledge-base-decision" }
      );
      return false;
    }
  }

  private async generateQuickActions(
    observedOpenAI: OpenAI,
    userMessage: string,
    assistantResponse: string,
    sessionId: string,
    buttonsPrompt: string
  ): Promise<any[]> {
    try {
      const response = await observedOpenAI.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: buttonsPrompt,
          },
          {
            role: "user",
            content: `User message: ${userMessage}\nAssistant response: ${assistantResponse}`,
          },
        ],
        temperature: 0,
        max_tokens: 300,
      });

      const content = response.choices[0]?.message?.content || "";
      const parsed = JSON.parse(content);
      return parsed.result || [];
    } catch (error) {
      console.error("Quick actions generation error:", error);
      this.langfuse.logError(
        sessionId,
        `Quick actions generation error: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { tool: "quick-actions" }
      );
      return [];
    }
  }
}
