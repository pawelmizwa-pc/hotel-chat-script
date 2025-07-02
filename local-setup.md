# Local Development Setup for Hotel Smile Chat Agent

## Step 1: Minimum Required Environment Variables

For local testing, you only need these **essential** variables:

### Required for Basic Functionality:

```bash
# Set these environment variables for local development
export OPENAI_API_KEY="sk-your-openai-api-key-here"
export LANGFUSE_HOST="https://cloud.langfuse.com"
export LANGFUSE_SECRET_KEY="sk-lf-your-secret-key"
export LANGFUSE_PUBLIC_KEY="pk-lf-your-public-key"
export CONTEXT_WINDOW_LENGTH="15"
export SERVICE_EMAIL_TO="test@example.com"
```

### Optional (for full functionality):

```bash
# Google Sheets (knowledge base will fall back gracefully if not set)
export GOOGLE_SHEETS_CLIENT_EMAIL="your-service-account@project.iam.gserviceaccount.com"
export GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key\n-----END PRIVATE KEY-----"
export GOOGLE_SHEETS_DOCUMENT_ID="1lx-s6rxPGn4IKgFQk7vrtO4nDH0diHE1dr04u8b6dx4"

# Gmail (service requests will fall back gracefully if not set)
export GMAIL_CLIENT_ID="your-gmail-client-id"
export GMAIL_CLIENT_SECRET="your-gmail-client-secret"
export GMAIL_REFRESH_TOKEN="your-gmail-refresh-token"
```

## Step 2: Set Up Local KV Storage

```bash
# Create a local KV namespace for development
npx wrangler kv:namespace create "CHAT_SESSIONS" --preview
```

## Step 3: Start Local Development

```bash
# Start the local development server
npm run dev
```

This will start the worker at `http://localhost:8787`

## Step 4: Test Locally

In another terminal:

```bash
# Run the test suite against local server
npm run test
```

Or test manually:

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test-123","message":"Witaj!"}'
```

## Quick Start (Minimum Setup)

If you just want to test the basic functionality:

1. Get an OpenAI API key from https://platform.openai.com/api-keys
2. Sign up for Langfuse at https://langfuse.com and create prompts (or use fallbacks)
3. Set the environment variables
4. Run `npm run dev`

The system will gracefully handle missing Google Sheets and Gmail credentials by providing fallback responses.
