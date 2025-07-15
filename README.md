# Hotel Chat Script

This is a hotel chat assistant powered by multiple LLM providers with tenant-specific configuration support.

## Features

- Multi-LLM provider support (OpenAI, Google AI, Anthropic, OpenRouter)
- Tenant-specific configuration and API keys
- Excel data integration for hotel information
- Email automation for service requests
- Memory management and conversation history
- Langfuse integration for monitoring and observability
- **UTM tracking and marketing attribution analytics**
- **Button interaction tracking and engagement analytics**

## Button Interaction Tracking

### Overview

The system tracks all button interactions to measure user engagement, upsell effectiveness, and conversation flow optimization. All button interaction data is automatically sent to Langfuse for detailed analytics.

### Supported Button Types

```typescript
interface ButtonInteraction {
  messageType: "dynamic_button" | "quick_reply" | "persistent_menu";
  buttonClicked: boolean;
  buttonType: "quick_reply" | "postback" | "web_url" | "call" | "upsell";
  buttonTitle: string;
  buttonPayload?: string;
  isUpsell: boolean;
  clickTimestamp?: string;
  previousMessageId?: string;
}
```

### Request Format with Button Interaction

```json
{
  "message": "Show me spa services",
  "sessionId": "session_123",
  "tenantId": "hotel-smile",
  "buttonInteraction": {
    "messageType": "dynamic_button",
    "buttonClicked": true,
    "buttonType": "quick_reply",
    "buttonTitle": "🍽️ Restaurant Menu",
    "buttonPayload": "restaurant_menu",
    "isUpsell": false,
    "clickTimestamp": "2024-01-15T12:15:00Z",
    "previousMessageId": "msg_123"
  }
}
```

### What Gets Tracked in Langfuse

1. **Button Click Events**: Every button interaction is logged as a separate span
2. **Interaction Tags**: Automatic tagging for easy filtering:

   - `button-clicked:true`
   - `button-type:quick_reply`
   - `message-type:dynamic_button`
   - `upsell:true` (for upsell buttons)
   - `button-title:restaurant-menu`

3. **Upsell Tracking**: Special tracking for upsell buttons with potential value
4. **Engagement Metrics**: Button engagement rates and interaction patterns

### Analytics Benefits

- **Engagement Analysis**: Track which buttons are most popular
- **Upsell Effectiveness**: Measure upsell button conversion rates
- **User Journey**: Understand conversation flow patterns
- **A/B Testing**: Compare different button designs and copy
- **Revenue Attribution**: Link button clicks to conversions and UTM sources

### Example Button Analytics Queries

```sql
-- Most clicked buttons
SELECT
  metadata->'buttonInteraction'->>'buttonTitle' as button_title,
  COUNT(*) as clicks
FROM traces
WHERE metadata->'hasButtonInteraction' = 'true'
GROUP BY button_title
ORDER BY clicks DESC;

-- Upsell button performance
SELECT
  metadata->'buttonInteraction'->>'buttonTitle' as upsell_button,
  COUNT(*) as upsell_clicks,
  COUNT(CASE WHEN name LIKE '%conversion%' THEN 1 END) as conversions
FROM traces
WHERE metadata->'buttonInteraction'->>'isUpsell' = 'true'
GROUP BY upsell_button;

-- Button engagement by UTM source
SELECT
  metadata->'utmTracking'->>'utm_source' as source,
  COUNT(*) as button_interactions,
  COUNT(DISTINCT sessionId) as unique_sessions,
  ROUND(COUNT(*) * 1.0 / COUNT(DISTINCT sessionId), 2) as avg_buttons_per_session
FROM traces
WHERE metadata->'hasButtonInteraction' = 'true'
GROUP BY source;
```

## UTM Tracking & Marketing Analytics

### Overview

The system supports comprehensive UTM tracking to measure marketing campaign effectiveness and conversion attribution. All UTM data is automatically sent to Langfuse for detailed analytics.

### Supported UTM Parameters

```typescript
interface UTMTracking {
  utm_source?: string; // Traffic source (google, facebook, newsletter)
  utm_medium?: string; // Marketing medium (cpc, social, email)
  utm_campaign?: string; // Campaign name (summer_sale, spa_promotion)
  utm_term?: string; // Paid keywords (hotel spa treatment)
  utm_content?: string; // Ad content (banner_ad, text_link)
  utm_id?: string; // Campaign ID (campaign_12345)
  gclid?: string; // Google Click ID
  fbclid?: string; // Facebook Click ID
  msclkid?: string; // Microsoft Click ID
}
```

### Request Format with UTM Data

```json
{
  "message": "Hello, I'd like to book a spa treatment",
  "sessionId": "session_123",
  "tenantId": "hotel-smile",
  "hasUTMData": true,
  "utmTracking": {
    "utm_source": "google",
    "utm_medium": "cpc",
    "utm_campaign": "summer_spa_promotion",
    "utm_term": "hotel spa treatment",
    "utm_content": "spa_banner_ad",
    "gclid": "TeSter-123_example_gclid"
  }
}
```

### What Gets Tracked in Langfuse

1. **Trace Metadata**: UTM parameters stored in trace metadata
2. **Marketing Tags**: Automatic tagging for easy filtering:

   - `source:google`
   - `medium:cpc`
   - `campaign:summer_spa_promotion`
   - `gclid:present`

3. **Conversion Events**: Automatic conversion tracking for:
   - Email requests (`conversion-email-request`)
   - Service bookings
   - Other conversion actions

### Analytics Benefits

- **Campaign Performance**: Track which campaigns drive the most conversations
- **Channel Attribution**: Understand which marketing channels work best
- **Conversion Tracking**: Measure email requests and bookings by UTM source
- **ROI Analysis**: Calculate marketing ROI per campaign/channel
- **A/B Testing**: Compare performance of different ad content

### Example Analytics Queries in Langfuse

```sql
-- Top performing campaigns by conversation volume
SELECT
  metadata->'utmTracking'->>'utm_campaign' as campaign,
  COUNT(*) as conversations
FROM traces
WHERE metadata->'hasMarketingData' = 'true'
GROUP BY campaign
ORDER BY conversations DESC;

-- Conversion rates by traffic source
SELECT
  tags->>'source' as source,
  COUNT(*) as total_conversations,
  COUNT(CASE WHEN name LIKE '%conversion%' THEN 1 END) as conversions,
  ROUND(COUNT(CASE WHEN name LIKE '%conversion%' THEN 1 END) * 100.0 / COUNT(*), 2) as conversion_rate
FROM traces
GROUP BY source;
```

## LLM Provider Configuration

### Global API Keys (Environment Variables)

Set these environment variables as fallback keys:

```
OPENAI_API_KEY=your-global-openai-key
GOOGLE_AI_API_KEY=your-global-google-key
ANTHROPIC_API_KEY=your-global-anthropic-key
OPENROUTER_API_KEY=your-global-openrouter-key
```

### Tenant-Specific API Keys (Optional)

Each tenant can override global API keys by setting these optional fields in their tenant configuration:

```json
{
  "spreadsheetId": "your-spreadsheet-id",
  "general-prompt-config": "Your tenant-specific prompts...",
  "buttons-prompt-config": "Button generation prompts...",
  "email-prompt-config": "Email handling prompts...",
  "excel-config": "Excel sheet configuration...",

  // Optional tenant-specific API keys (will override global keys if provided)
  "openai-api-key": "sk-tenant-specific-openai-key",
  "openrouter-api-key": "sk-tenant-specific-openrouter-key",
  "google-ai-api-key": "tenant-specific-google-ai-key",
  "anthropic-api-key": "sk-ant-tenant-specific-anthropic-key"
}
```

### How It Works

1. **Global Fallback**: If no tenant-specific API key is provided, the system uses the global environment variable keys
2. **Tenant Override**: If a tenant-specific API key is provided, it takes precedence over the global key for that tenant
3. **Provider Selection**: Only providers with valid API keys (global or tenant-specific) are available for use
4. **Dynamic Configuration**: API keys are configured per request based on the tenant configuration

### Benefits

- **Multi-tenancy**: Different tenants can use different LLM providers or accounts
- **Cost Management**: Separate billing per tenant
- **Rate Limiting**: Independent rate limits per tenant
- **Security**: Tenant isolation with separate API keys
- **Flexibility**: Mix and match providers per tenant

### Example Usage

```javascript
// Tenant A uses their own OpenAI key
{
  "tenantId": "hotel-a",
  "openai-api-key": "sk-tenant-a-openai-key"
  // Will use tenant's OpenAI key instead of global key
}

// Tenant B uses global keys (no override)
{
  "tenantId": "hotel-b"
  // Will use global environment variable keys
}

// Tenant C uses multiple custom providers
{
  "tenantId": "hotel-c",
  "openai-api-key": "sk-tenant-c-openai-key",
  "anthropic-api-key": "sk-ant-tenant-c-anthropic-key"
  // Will use tenant's OpenAI and Anthropic keys, global keys for other providers
}
```

## Setup

1. Set up your global environment variables
2. Configure tenant-specific settings in KV storage
3. Deploy to Cloudflare Workers
4. Test with different tenants to verify API key routing
5. Set up UTM tracking in your marketing campaigns
6. Monitor analytics in Langfuse dashboard

See `src/examples/hotel-smile-kv-config.json` for a complete configuration example.
See `src/examples/utm-tracking-example.json` for UTM tracking request examples.
