export interface ChatRequest {
  sessionId: string;
  message: string;
  language?: string;
}

export interface ChatResponse {
  recipient: {
    id: string;
  };
  messaging_type: "RESPONSE";
  message: {
    attachment: {
      type: "template";
      payload: {
        template_type: "button";
        language: string;
        text: string;
        buttons: Array<{
          type: "postback";
          title: string;
          payload: string;
        }>;
      };
    };
  };
}

export interface SessionMemory {
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export interface LangfusePrompt {
  prompt: string;
  config?: Record<string, any>;
}

export interface Env {
  // OpenAI
  OPENAI_API_KEY: string;

  // Langfuse
  LANGFUSE_HOST: string;
  LANGFUSE_SECRET_KEY: string;
  LANGFUSE_PUBLIC_KEY: string;

  // Google Sheets
  GOOGLE_SHEETS_API_KEY: string;
  GOOGLE_SHEETS_DOCUMENT_ID: string;

  // Gmail
  GMAIL_CLIENT_ID: string;
  GMAIL_CLIENT_SECRET: string;
  GMAIL_REFRESH_TOKEN: string;
  GMAIL_ACCESS_TOKEN: string;

  // Email
  SERVICE_EMAIL_TO: string;

  // Configuration
  CONTEXT_WINDOW_LENGTH: string;

  // KV Storage
  CHAT_SESSIONS: KVNamespace;
}
