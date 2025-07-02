import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createOpenAIFunctionsAgent } from "langchain/agents";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { AIMessage, HumanMessage } from "@langchain/core/messages";

import {
  Env,
  ChatRequest,
  ChatResponse,
  QuickAction,
  ChatMessage,
} from "../types";
import { LangfuseService } from "./langfuse";
import { MemoryService } from "./memory";
import { GoogleSheetsKnowledgeBaseTool } from "../tools/googleSheets";
import { GmailServiceRequestTool } from "../tools/gmail";

export class ChatService {
  private env: Env;
  private langfuseService: LangfuseService;
  private memoryService: MemoryService;
  private llm: ChatOpenAI;

  constructor(env: Env) {
    this.env = env;
    this.langfuseService = new LangfuseService(env);
    this.memoryService = new MemoryService(env);

    // Initialize OpenAI model
    this.llm = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      openAIApiKey: env.OPENAI_API_KEY,
      temperature: 0.7,
    });
  }

  async processMessage(request: ChatRequest): Promise<ChatResponse> {
    try {
      // Get prompts from Langfuse
      const prompts = await this.langfuseService.getAllPrompts();

      // Get conversation history
      const conversationHistory =
        await this.memoryService.getConversationHistory(request.sessionId);

      // Create tools
      const knowledgeBaseTool = new GoogleSheetsKnowledgeBaseTool(
        this.env,
        prompts.knowledgeBaseTool.prompt
      );

      const gmailTool = new GmailServiceRequestTool(
        this.env,
        this.getServiceRequestToolDescription()
      );

      const tools = [knowledgeBaseTool, gmailTool];

      // Create agent prompt
      const prompt = ChatPromptTemplate.fromMessages([
        ["system", prompts.guestService.prompt],
        new MessagesPlaceholder("chat_history"),
        ["human", "{input}"],
        new MessagesPlaceholder("agent_scratchpad"),
      ]);

      // Create agent
      const agent = await createOpenAIFunctionsAgent({
        llm: this.llm,
        tools,
        prompt,
      });

      // Create agent executor
      const agentExecutor = new AgentExecutor({
        agent,
        tools,
        verbose: true,
        maxIterations: 3,
      });

      // Format conversation history for LangChain
      const chatHistory = this.formatChatHistory(conversationHistory);

      // Execute agent
      const result = await agentExecutor.invoke({
        input: request.message,
        chat_history: chatHistory,
      });

      // Save user message to memory
      await this.memoryService.addMessage(request.sessionId, {
        role: "user",
        content: request.message,
        timestamp: Date.now(),
      });

      // Save assistant response to memory
      await this.memoryService.addMessage(request.sessionId, {
        role: "assistant",
        content: result.output,
        timestamp: Date.now(),
      });

      // Generate quick actions/buttons
      const quickActions = await this.generateQuickActions(
        request.message,
        result.output,
        prompts.buttons.prompt
      );

      return {
        message: {
          content: {
            result: quickActions,
          },
        },
        text: result.output,
      };
    } catch (error) {
      console.error("Error processing message:", error);

      // Fallback response
      return {
        message: {
          content: {
            result: [
              {
                title: "Skontaktuj się z recepcją",
                payload: "contact_reception",
              },
            ],
          },
        },
        text: "Przepraszam, wystąpił problem techniczny. Proszę skontaktować się bezpośrednio z recepcją hotelu pod numerem telefonu dostępnym na stronie internetowej.",
      };
    }
  }

  private formatChatHistory(
    messages: ChatMessage[]
  ): (HumanMessage | AIMessage)[] {
    return messages
      .map((msg) => {
        if (msg.role === "user") {
          return new HumanMessage(msg.content);
        } else if (msg.role === "assistant") {
          return new AIMessage(msg.content);
        } else {
          // Skip system messages for chat history
          return null;
        }
      })
      .filter((msg) => msg !== null) as (HumanMessage | AIMessage)[];
  }

  private async generateQuickActions(
    userMessage: string,
    serviceResponse: string,
    buttonsPrompt: string
  ): Promise<QuickAction[]> {
    try {
      // Create a separate LLM call for generating buttons
      const buttonLLM = new ChatOpenAI({
        modelName: "gpt-4o-mini",
        openAIApiKey: this.env.OPENAI_API_KEY,
        temperature: 0.3,
      });

      const prompt = `${buttonsPrompt}\n\nUSER: ${userMessage}\nSERVICE: ${serviceResponse}`;

      const response = await buttonLLM.invoke([
        { role: "user", content: prompt },
      ]);

      // Try to parse JSON response
      const content = response.content as string;
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.result && Array.isArray(parsed.result)) {
          return parsed.result;
        }
      }

      // Fallback buttons
      return this.getDefaultQuickActions();
    } catch (error) {
      console.error("Error generating quick actions:", error);
      return this.getDefaultQuickActions();
    }
  }

  private getDefaultQuickActions(): QuickAction[] {
    return [
      {
        title: "Hasło WiFi",
        payload: "1",
      },
      {
        title: "Godziny śniadań",
        payload: "2",
      },
      {
        title: "Oferta SPA",
        payload: "3",
      },
      {
        title: "Pomoc",
        payload: "help",
      },
    ];
  }

  private getServiceRequestToolDescription(): string {
    return `Hotel Service Request Tool
Enables sending service requests for additional services to Hotel Smile. DO NOT use it for spa relates reservations. This is the only method for accepting orders other than direct phone calls to the hotel reception. Never confirm order acceptance unless you successfully use this tool.
Required parameters:
"Requested_Service" - One of the additional services or massages. Ensure the requested service is on the list of additional services or massage/spa services. Do not accept other items. Ask the user for clarification if needed.
"Guest_Information" - Data identifying the guest (1 of 2 required): either email address from the reservation OR (room number + guest surname). Always ask for both pieces of information and remember them for future orders.
"Preferred_Time" - Preferred service date and time in DD:MM HH:MM format (e.g., "25:06 14:30" for June 25th at 2:30 PM). Always ask the guest for their preferred service time. Note that user can provide this time in different format.
"Comments" - Optional field for additional customer comments or special requests.
Process Guidelines:

Collect all necessary information from the user before using this tool
Everything except "Comments" is mandatory, including the preferred service time
Always ask for the preferred date and time
Before sending, always verify that all data is correct, including the time format
Allow the customer to add additional comments or modify the preferred time
Critical step: Always verify the complete order (service, guest info, time, comments) before sending the email
Confirm that the request has been sent to reception, informing the guest that reception will contact them if there are any issues with service delivery or scheduling

Time Format Examples:

"23:06 10:00" (June 23rd at 10:00 AM)
"24:06 15:30" (June 24th at 3:30 PM)
"25:06 09:15" (June 25th at 9:15 AM)`;
  }
}
