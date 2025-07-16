import {
  Env,
  ChatMessage,
  LLMProvider,
  LLMProviderType,
  LLMProviderConfig,
  LLMCompletionOptions,
  LLMCompletionResponse,
} from "../../types";
import { TenantConfig } from "../../tasks/dataCollectionTask";
import { OpenAIProvider } from "./openaiProvider";
import { GoogleProvider } from "./googleProvider";
import { AnthropicProvider } from "./anthropicProvider";
import { OpenRouterProvider } from "./openrouterProvider";
import { GroqProvider } from "./groqProvider";

export class LLMService {
  private providers: Map<LLMProviderType, LLMProvider> = new Map();
  private env: Env;

  constructor(env: Env) {
    this.env = env;
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // Initialize all available providers
    const openai = new OpenAIProvider(this.env);
    const google = new GoogleProvider(this.env);
    const anthropic = new AnthropicProvider(this.env);
    const openrouter = new OpenRouterProvider(this.env);
    const groq = new GroqProvider(this.env);

    this.providers.set("openai", openai);
    this.providers.set("google", google);
    this.providers.set("anthropic", anthropic);
    this.providers.set("openrouter", openrouter);
    this.providers.set("groq", groq);
  }

  /**
   * Configure providers with tenant-specific API keys
   * @param tenantConfig The tenant configuration containing optional API keys
   */
  configureTenantApiKeys(tenantConfig: TenantConfig | null): void {
    if (!tenantConfig) return;

    // Set tenant API keys for each provider if available
    const openaiProvider = this.providers.get("openai");
    if (openaiProvider && tenantConfig["openai-api-key"]) {
      openaiProvider.setTenantApiKey(tenantConfig["openai-api-key"]);
    }

    const googleProvider = this.providers.get("google");
    if (googleProvider && tenantConfig["google-ai-api-key"]) {
      googleProvider.setTenantApiKey(tenantConfig["google-ai-api-key"]);
    }

    const anthropicProvider = this.providers.get("anthropic");
    if (anthropicProvider && tenantConfig["anthropic-api-key"]) {
      anthropicProvider.setTenantApiKey(tenantConfig["anthropic-api-key"]);
    }

    const openrouterProvider = this.providers.get("openrouter");
    if (openrouterProvider && tenantConfig["openrouter-api-key"]) {
      openrouterProvider.setTenantApiKey(tenantConfig["openrouter-api-key"]);
    }

    const groqProvider = this.providers.get("groq");
    if (groqProvider && tenantConfig["groq-api-key"]) {
      groqProvider.setTenantApiKey(tenantConfig["groq-api-key"]);
    }
  }

  /**
   * Reset all providers to use default API keys
   */
  resetToDefaultApiKeys(): void {
    this.providers.forEach((provider) => {
      provider.setTenantApiKey(undefined);
    });
  }

  /**
   * Get all available providers (those with valid API keys)
   */
  getAvailableProviders(): LLMProvider[] {
    return Array.from(this.providers.values()).filter((provider) =>
      provider.isAvailable()
    );
  }

  /**
   * Get provider by type
   */
  getProvider(type: LLMProviderType): LLMProvider | null {
    const provider = this.providers.get(type);
    return provider && provider.isAvailable() ? provider : null;
  }

  // getSupportedModels method removed - no longer restricting models

  /**
   * Create completion using specified provider and model
   */
  async createCompletion(
    messages: ChatMessage[],
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      provider?: LLMProviderType;
    } = {}
  ): Promise<{
    content: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    model: string;
    finishReason: string | null;
    provider: LLMProviderType;
  }> {
    const {
      model = "gpt-4o-mini",
      temperature = 0,
      maxTokens = 1000,
      provider = "openai",
    } = options;

    const config: LLMProviderConfig = {
      provider,
      model,
      temperature,
      maxTokens,
    };

    const providerInstance = this.getProvider(config.provider);
    if (!providerInstance) {
      throw new Error(`Provider ${config.provider} is not available`);
    }

    // Model validation removed - assuming user knows supported models

    const completionOptions: LLMCompletionOptions = {
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    };

    const response = await providerInstance.createCompletion(
      messages,
      completionOptions
    );

    return {
      content: response.content,
      usage: response.usage,
      model: response.model,
      finishReason: response.finishReason,
      provider: response.provider,
    };
  }

  /**
   * Create completion using LLMProviderConfig (for advanced usage)
   */
  async createCompletionWithConfig(
    messages: ChatMessage[],
    config: LLMProviderConfig
  ): Promise<LLMCompletionResponse> {
    const provider = this.getProvider(config.provider);
    if (!provider) {
      throw new Error(`Provider ${config.provider} is not available`);
    }

    // Model validation removed - assuming user knows supported models

    const options: LLMCompletionOptions = {
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    };

    return await provider.createCompletion(messages, options);
  }

  /**
   * Create completion with automatic provider selection
   * Falls back to available providers if the preferred one is not available
   */
  async createCompletionWithFallback(
    messages: ChatMessage[],
    preferredConfig: LLMProviderConfig,
    fallbackConfigs: LLMProviderConfig[] = []
  ): Promise<LLMCompletionResponse> {
    // Try preferred provider first
    const preferredProvider = this.getProvider(preferredConfig.provider);
    if (preferredProvider) {
      try {
        return await this.createCompletion(messages, preferredConfig);
      } catch (error) {
        console.warn(
          `Preferred provider ${preferredConfig.provider} failed:`,
          error
        );
      }
    }

    // Try fallback providers
    for (const fallbackConfig of fallbackConfigs) {
      const fallbackProvider = this.getProvider(fallbackConfig.provider);
      if (fallbackProvider) {
        try {
          return await this.createCompletion(messages, fallbackConfig);
        } catch (error) {
          console.warn(
            `Fallback provider ${fallbackConfig.provider} failed:`,
            error
          );
        }
      }
    }

    // If all else fails, use any available provider
    const availableProviders = this.getAvailableProviders();
    if (availableProviders.length === 0) {
      throw new Error("No LLM providers are available");
    }

    const defaultProvider = availableProviders[0];
    const defaultConfig: LLMProviderConfig = {
      provider: defaultProvider.type,
      model: "gpt-4o-mini", // Default fallback model
      temperature: preferredConfig.temperature,
      maxTokens: preferredConfig.maxTokens,
    };

    return await this.createCompletion(messages, defaultConfig);
  }

  /**
   * Get OpenAI client for backward compatibility (e.g., for Langfuse)
   */
  getOpenAIClient(): any {
    const openaiProvider = this.providers.get("openai") as OpenAIProvider;
    return openaiProvider?.getClient();
  }
}
