import { Env, ChatRequest, ChatResponse } from "./types";
import { DataCollectionTask } from "./tasks/dataCollectionTask";
import { GuestServiceTask } from "./tasks/guestServiceTask";
import { ButtonsTask } from "./tasks/buttonsTask";
import { EmailTask } from "./tasks/emailTask";
import { MemoryService } from "./services/memory";

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return handleCORS();
    }

    // Only allow POST requests
    if (request.method !== "POST") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      // Parse request body
      const chatRequest: ChatRequest = await request.json();

      // Validate required fields
      if (!chatRequest.sessionId || !chatRequest.message) {
        return new Response(
          JSON.stringify({
            error: "Missing required fields: sessionId and message",
          }),
          {
            status: 400,
            headers: getCORSHeaders(),
          }
        );
      }

      // Initialize by collecting data from all services
      const dataCollectionTask = new DataCollectionTask(env);
      const collectedData = await dataCollectionTask.collectData(
        chatRequest.sessionId
      );

      // Initialize tasks
      const guestServiceTask = new GuestServiceTask(env);
      const buttonsTask = new ButtonsTask(env);
      const emailTask = new EmailTask(env);
      const memoryService = new MemoryService(env);

      // 1st OpenAI call: user input + history + excel + guest-service prompt
      const firstResponse = await guestServiceTask.execute({
        userMessage: chatRequest.message,
        sessionHistory: collectedData.sessionHistory,
        excelData: collectedData.excelData,
        guestServicePrompt: collectedData.prompts.guestService,
        knowledgeBasePrompt: collectedData.prompts.knowledgeBaseTool,
        sessionId: chatRequest.sessionId,
      });

      // 2nd & 3rd OpenAI calls: run in parallel using first call output
      const [secondResponse, thirdResponse] = await Promise.all([
        // 2nd OpenAI call: output from 1st + excel + buttons prompt + user input
        buttonsTask.execute({
          userMessage: chatRequest.message,
          firstCallOutput: firstResponse.content,
          excelData: collectedData.excelData,
          buttonsPrompt: collectedData.prompts.buttons,
          knowledgeBasePrompt: collectedData.prompts.knowledgeBaseTool,
          sessionId: chatRequest.sessionId,
        }),
        // 3rd OpenAI call: output from 1st + excel + knowledge-base-tool prompt + user input
        emailTask.execute({
          userMessage: chatRequest.message,
          firstCallOutput: firstResponse.content,
          excelData: collectedData.excelData,
          emailToolPrompt: collectedData.prompts.emailTool,
          knowledgeBasePrompt: collectedData.prompts.knowledgeBaseTool,
          sessionId: chatRequest.sessionId,
        }),
      ]);

      // Parse buttons from secondResponse
      let buttons: Array<{ type: "postback"; title: string; payload: string }> =
        [];
      try {
        const buttonsData = JSON.parse(secondResponse.content);
        if (buttonsData.result && Array.isArray(buttonsData.result)) {
          buttons = buttonsData.result.map((item: any) => ({
            type: "postback" as const,
            title: item.title,
            payload: item.payload,
          }));
        }
      } catch (error) {
        console.warn("Failed to parse buttons from secondResponse:", error);
      }

      // Create the response structure
      const response: ChatResponse = {
        recipient: {
          id: chatRequest.sessionId,
        },
        messaging_type: "RESPONSE",
        message: {
          attachment: {
            type: "template",
            payload: {
              template_type: "button",
              language: chatRequest.language || "en",
              text: thirdResponse.content,
              buttons: buttons,
            },
          },
        },
      };

      // Save session memory before sending response
      try {
        // Use existing session memory from collectedData
        const sessionMemory = collectedData.sessionHistory;

        // Add user message to memory
        sessionMemory.messages.push({
          role: "user",
          content: chatRequest.message,
          timestamp: Date.now(),
        });

        // Add assistant response to memory
        sessionMemory.messages.push({
          role: "assistant",
          content: thirdResponse.content,
          timestamp: Date.now(),
        });

        // Save updated session memory
        await memoryService.saveSessionMemory(
          chatRequest.sessionId,
          sessionMemory
        );
      } catch (error) {
        console.error("Failed to save session memory:", error);
        // Don't fail the request if memory saving fails
      }

      // Return response
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: getCORSHeaders(),
      });
    } catch (error) {
      console.error("Error processing chat request:", error);

      // Return error response
      return new Response(
        JSON.stringify({
          error: "Internal server error",
          message:
            "Przepraszam, wystąpił problem techniczny. Spróbuj ponownie lub skontaktuj się z recepcją hotelu.",
        }),
        {
          status: 500,
          headers: getCORSHeaders(),
        }
      );
    }
  },
};

function handleCORS(): Response {
  return new Response(null, {
    status: 200,
    headers: getCORSHeaders(),
  });
}

function getCORSHeaders(): Headers {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

// Health check endpoint
export async function handleHealthCheck(): Promise<Response> {
  return new Response(
    JSON.stringify({
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "Hotel Smile Chat Agent",
    }),
    {
      status: 200,
      headers: getCORSHeaders(),
    }
  );
}
