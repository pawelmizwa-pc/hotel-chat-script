# Hotel Chat Script - Technical Documentation

## Branch Structure

This project uses two main working branches:

- **`main`** - Production environment branch

  - Deployed to: [hotel-agent-backend-prod](https://dash.cloudflare.com/56d4f8cb479f5b2e8f681923022388bb/workers/services/view/hotel-agent-backend-prod/production/settings)
  - Langfuse: [Production Project](https://cloud.langfuse.com/project/cmdfpthet030bad07pbo7ygfb)

- **`test`** - Test environment branch
  - Deployed to: [hotel-agent-backend-test](https://dash.cloudflare.com/56d4f8cb479f5b2e8f681923022388bb/workers/services/view/hotel-agent-backend-test/production/settings)
  - Langfuse: [Test Project](https://cloud.langfuse.com/project/cmcvrrg3x00qvad07fkq5x64g)

## Development and Deployment

### Getting Started

1. **Clone and setup**:

   ```bash
   git clone <repository>
   cd hotel-chat-script
   npm install
   ```

2. **Environment setup**:

   - Copy `env.example` to `.env`
   - Copy `env.example` to `.dev.vars`
   - Configure required API keys (see [Environment Configuration](#environment-configuration))

3. **Local development**:

   ```bash
   npm run dev          # Start local development server
   npm run build        # Build TypeScript
   npm run type-check   # Validate TypeScript types
   ```

4. **Deployment**:
   ```bash
   npm run deploy       # Deploy to Cloudflare Workers
   ```

## Table of Contents

1. [Project Overview](#project-overview)
2. [File Structure and Organization](#file-structure-and-organization)
3. [Task Functionality](#task-functionality)
4. [Examples Folder](#examples-folder)
5. [Environment Configuration](#environment-configuration)
6. [Error Handling](#error-handling)
7. [LLM Providers](#llm-providers)
8. [Third-Party Integrations](#third-party-integrations)
9. [Caching and KV Stores](#caching-and-kv-stores)
10. [Langfuse Tracking](#langfuse-tracking)

## Project Overview

Hotel Chat Script is a Cloudflare Worker-based AI hotel assistant that processes guest inquiries, manages reservations, and provides hotel information. The system uses multiple LLM providers, integrates with Google Sheets for data storage, and implements comprehensive session management with caching.

## File Structure and Organization

### Core Architecture

- **Entry Point**: `src/index.ts` - Cloudflare Worker main handler with CORS and routing
- **Orchestration**: `src/services/chatHandler.ts` - Main coordinator for all tasks and services
- **Configuration**: `src/config/` and `src/types.ts` - LLM configs and TypeScript definitions

### Service Layer (`src/services/`)

- **LLM Management**: `llm/` directory with provider implementations and main service
- **Data Integration**: `googleSheets.ts` for Google Sheets API with JWT auth
- **Session Management**: `memory.ts` for KV-based session storage
- **Observability**: `langfuse.ts` for tracking and prompt management
- **Communication**: `emailService.ts` for Resend API integration

### Task Processing (`src/tasks/`)

Six specialized tasks handle different aspects of the conversation flow:

- Data collection and configuration loading
- Excel sheet matching and data fetching
- Guest service conversation processing
- Dynamic button generation
- Email handling for reservations

### Utilities (`src/utils/`)

Supporting utilities for formatting, parsing, validation, and usage tracking.

### Examples (`src/examples/`)

Langfuse prompts and tenant configuration examples for development reference.

## Task Functionality

The system processes requests through a coordinated task pipeline:

1. **Data Collection** - Gathers tenant config, session memory, and Langfuse prompts
2. **Excel Sheet Matching** - Uses LLM to determine relevant hotel data sheets
3. **Excel Data Fetching** - Retrieves and caches hotel information from Google Sheets
4. **Guest Service** - Core conversational AI that responds using retrieved context
5. **Buttons Generation** - Creates dynamic UI buttons for enhanced UX
6. **Email Processing** - Handles service reservations and staff notifications

Each task is independently configurable through Langfuse prompts and LLM configurations. **Guest Service** and **Email Processing** tasks include built-in resilience through automatic alternative model fallback when primary LLM providers fail.

## Examples Folder

### KV Store Configuration (`hotel-smile-kv-config.json`)

Tenant-specific settings including:

- Google Sheets document ID
- Prompt configurations for each task type
- Optional tenant-specific API keys
- Email notification recipients

### Langfuse Prompts (`.md` files)

System prompts stored in Langfuse and cached locally:

- `general.md` - Core AI assistant behavior and workflow
- `buttons.md` - Dynamic button generation rules
- `email.md` - Email handling requirements and JSON format
- `excel.md` - Data processing and sheet selection strategies

## Environment Configuration

### Required Variables

Create `.env` from `env.example` with:

**LLM Providers**: At least one API key required (OpenAI, Anthropic, Google AI, Groq, OpenRouter)

**Langfuse**: Host URL and API keys for observability

**Google Sheets**: Service account credentials for data access

**Email**: Resend API key for notifications

**Session**: Context window length (default: 15 messages)

### Google Cloud Setup

The system uses Google Cloud service account authentication for Google Sheets integration. Your Google Cloud project handles secure API access without manual authentication flows.

#### Google Cloud Console Configuration

- **Project**: [hotel-instant-information](https://console.cloud.google.com/apis/credentials?inv=1&invt=Ab4Dqw&project=hotel-instant-information)
- **Service Account**: Required for JWT-based authentication
- **Sheets API**: Must be enabled for the project

#### Environment Variables Mapping

From your Google Cloud Console credentials:

1. **Service Account Email** → `GOOGLE_SERVICE_ACCOUNT_EMAIL` in `.env`
2. **Private Key** → `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` in `.env`
3. **Target Spreadsheet** → `GOOGLE_SHEETS_DOCUMENT_ID` in `.env`

#### Integration Flow

- **JWT Creation**: System generates signed tokens using service account private key
- **Sheets API Access**: Fetches hotel data from configured spreadsheets
- **Data Caching**: Stores retrieved data in KV stores to minimize API calls
- **Auto-Refresh**: Updates cached data when TTL expires

#### Key Implementation Files

- `src/services/googleSheets.ts` - Handles JWT creation and Sheets API calls
- `src/tasks/excelDataFetchingTask.ts` - Manages data retrieval and caching
- `wrangler.toml` - Contains default `GOOGLE_SHEETS_DOCUMENT_ID`

This setup enables dynamic hotel data updates through Google Sheets without requiring code changes, allowing hotel staff to manage information directly in spreadsheets.

## Error Handling

Multi-level strategy ensures graceful degradation:

- **Request Level**: CORS, validation, global error catching
- **Service Level**: Provider fallbacks, KV operation recovery, auth error handling
- **Task Level**: LLM response parsing, data validation, cache recovery, automatic alternative model fallback (Guest Service & Email Processing)
- **User Facing**: Polish language messages with technical logging

### Alternative Model Fallback

**Guest Service** and **Email Processing** tasks implement automatic LLM failure recovery through alternative model configuration:

- **Primary Model Failure**: When the configured LLM model fails, tasks automatically attempt the alternative model
- **Dual Provider Support**: Alternative models can use different providers for maximum resilience
- **Error Logging**: All LLM failures are logged to Langfuse with detailed error metadata including model, provider, and timestamp
- **Graceful Degradation**: Only after both primary and alternative models fail does the task throw an error

## LLM Providers

Provider selection is configured in `src/config/llmConfig.ts` which defines:

- Model and provider per task type
- Temperature and token limits
- Default configurations with override support
- Alternative model configurations for automatic fallback (Guest Service & Email Processing)

### Configuration Structure

**Guest Service** and **Email Processing** tasks include both primary and alternative LLM configurations:

- **Primary Configuration**: Default model, provider, temperature, and token limits
- **Alternative Configuration**: Fallback model with potentially different provider for resilience
- **Automatic Switching**: Tasks seamlessly switch to alternative configuration when primary fails
- **Provider Diversity**: Alternative configurations often use different providers to avoid cascading failures

The system automatically falls back between providers based on availability and supports tenant-specific API key overrides.

## Third-Party Integrations

### Langfuse

Observability platform providing trace management, prompt versioning, and usage analytics. Tracks complete request flows with spans for individual tasks and generations for LLM calls.

### Google Sheets

Hotel data storage accessed via service account JWT authentication. Data is automatically converted to markdown format and cached in KV stores.

### Resend

Transactional email service for reservation confirmations and staff notifications with high deliverability optimization.

### LLM SDKs

Official SDKs for all supported providers with streaming responses, usage tracking, and error handling.

## Caching and KV Stores

### Three-Tier KV Architecture

**CHAT_SESSIONS**: Session memory with 7-day TTL and 4-hour message expiration

```
Key: session:{tenantId}:{sessionId}
```

**TENAT_CONFIG**: Per-tenant configuration including prompts and API keys

```
Key: {tenantId}
```

**TENAT_KNOWLEDGE_CACHE**: Excel data cache with configurable TTL

```
Key: excel:{tenantId}:{sheetName}
```

### Cache Strategy

- **L1**: Request-scoped in-memory caching
- **L2**: Persistent KV storage across requests
- **L3**: External APIs (Google Sheets, Langfuse)

Automatic invalidation via TTL with tenant isolation through key namespacing.

## Langfuse Tracking

### Tracking Hierarchy

**Traces**: Complete chat requests with session ID, tenant ID, and UTM tracking

**Spans**: Individual tasks (data collection, Excel processing, guest service, email)

**Generations**: LLM API calls with model, usage, and cost tracking

### Usage Tracking

Token accounting across all providers with input/output/cache tokens and real-time cost calculation. Supports tenant attribution and historical analysis for optimization.

The system is designed for high availability, scalability, and maintainability with comprehensive error handling, caching, and observability features.
