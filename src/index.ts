import { Env, ChatRequest } from "./types";
import { ChatService } from "./services/chatService";

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

      // Initialize chat service
      const chatService = new ChatService(env);

      // Process the message
      const response = await chatService.processMessage(chatRequest);

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
