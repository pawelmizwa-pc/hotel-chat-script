import { LLMProviderType } from "../types";

export interface TaskLLMConfig {
  model: string;
  provider: LLMProviderType;
  temperature: number;
  maxTokens?: number;
  alternative: {
    model: string;
    provider: LLMProviderType;
    temperature: number;
    maxTokens?: number;
  };
}

export interface LLMTaskConfigs {
  buttonsTask: TaskLLMConfig;
  emailTask: TaskLLMConfig;
  guestServiceTask: TaskLLMConfig;
  excelSheetMatchingTask: TaskLLMConfig;
}

export const LLM_TASK_CONFIGS: LLMTaskConfigs = {
  buttonsTask: {
    model: "tngtech/deepseek-r1t2-chimera:free",
    provider: "openrouter",
    temperature: 0.7,
    alternative: {
      model: "gemini-2.5-flash-lite-preview-06-17",
      provider: "google",
      temperature: 0.7,
    },
  },
  emailTask: {
    model: "gpt-4o",
    provider: "openai",
    temperature: 0.7,
    alternative: {
      model: "gemini-2.5-flash",
      provider: "google",
      temperature: 0.7,
    },
  },
  guestServiceTask: {
    model: "gpt-4.1-mini",
    provider: "openai",
    temperature: 0.7,
    alternative: {
      model: "gemini-2.5-flash-lite-preview-06-17",
      provider: "google",
      temperature: 0.7,
    },
  },
  excelSheetMatchingTask: {
    model: "tngtech/deepseek-r1t2-chimera:free",
    provider: "openrouter",
    temperature: 0.7,
    alternative: {
      model: "gemini-2.5-flash-lite-preview-06-17",
      provider: "google",
      temperature: 0.7,
    },
  },
};

/**
 * Get LLM configuration for a specific task
 * @param taskName - Name of the task
 * @returns TaskLLMConfig for the specified task
 */
export function getLLMConfig(taskName: keyof LLMTaskConfigs): TaskLLMConfig {
  return LLM_TASK_CONFIGS[taskName];
}

/**
 * Get LLM configuration with overrides
 * @param taskName - Name of the task
 * @param overrides - Partial configuration to override defaults
 * @returns Merged TaskLLMConfig
 */
export function getLLMConfigWithOverrides(
  taskName: keyof LLMTaskConfigs,
  overrides: Partial<TaskLLMConfig>
): TaskLLMConfig {
  return {
    ...LLM_TASK_CONFIGS[taskName],
    ...overrides,
  };
}
