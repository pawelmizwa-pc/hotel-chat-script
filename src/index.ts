import { Env, ChatRequest, ChatResponse } from "./types";
import { DataCollectionTask } from "./tasks/dataCollectionTask";

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

      // Process the message with collected data
      const response: ChatResponse = {
        message: {
          content: {
            result: [],
          },
        },
        text: `Dziękuję za wiadomość! Zebrałem dane:
- Prompty z Langfuse: ${
          collectedData.prompts.guestService ? "✓" : "✗"
        } guest-service, ${
          collectedData.prompts.buttons ? "✓" : "✗"
        } buttons, ${
          collectedData.prompts.knowledgeBaseTool ? "✓" : "✗"
        } knowledge-base-tool
- Dane Excel: ${collectedData.excelData.length} znaków
- Historia sesji: ${collectedData.sessionHistory.length} wiadomości

Twoja wiadomość: ${chatRequest.message}`,
      };

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
