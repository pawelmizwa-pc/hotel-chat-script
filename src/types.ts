export interface ChatRequest {
  sessionId: string;
  message: string;
  language?: string;
  spreadSheetId?: string;
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

  // Gmail SMTP
  GMAIL_USER: string;
  GMAIL_APP_PASSWORD: string;
  GMAIL_FROM_NAME?: string;

  // Resend
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;

  // Email
  SERVICE_EMAIL_TO: string;

  // Configuration
  CONTEXT_WINDOW_LENGTH: string;

  // KV Storage
  CHAT_SESSIONS: KVNamespace;
}

export interface DynamicButton {
  type: string;
  payload: string;
  title: string;
}

export interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  buttons?: DynamicButton[]; // Dynamic buttons from bot response
}

export interface Language {
  code: string;
  name: string;
  flag: string;
}

export interface ServiceButton {
  id: string;
  icon: string;
  labels: {
    [key: string]: string; // language code -> label
  };
  messages: {
    [key: string]: string; // language code -> message
  };
}

export interface Translation {
  appTitle: string;
  appSubtitle: string;
  selectLanguage: string;
  welcomeTitle: string;
  welcomeDescription: string;
  offersTitle: string;
  offersText: string;
  offersText2: string;
  startTyping: string;
  placeholder: string;
  send: string;
  sending: string;
  typing: string;
  errorMessage: string;
  contactInfo: string;
  // Language selection
  languageSelectionMessage: string;
  // Message labels
  guestLabel: string;
  assistantLabel: string;
  // SPA promotion
  spaPromoTitle: string;
  spaPromoDescription: string;
  askButton: string;
  // Header controls
  expandHeader: string;
  collapseHeader: string;
  // Button instructions
  buttonInstructions: string;
}

export type LanguageCode = "pl" | "de" | "en" | "cz" | "sk";
