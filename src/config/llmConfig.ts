import { LLMProviderType } from "../types";

export interface TaskLLMConfig {
  model: string;
  provider: LLMProviderType;
  temperature: number;
  maxTokens: number;
}

export interface LLMTaskConfigs {
  buttonsTask: TaskLLMConfig;
  emailTask: TaskLLMConfig;
  guestServiceTask: TaskLLMConfig;
  excelSheetMatchingTask: TaskLLMConfig;
}

export const LLM_TASK_CONFIGS: LLMTaskConfigs = {
  buttonsTask: {
    model: "claude-3-5-haiku-latest",
    provider: "anthropic",
    temperature: 0.5,
    maxTokens: 1000,
  },
  emailTask: {
    model: "claude-3-5-sonnet-latest",
    provider: "anthropic",
    temperature: 0.5,
    maxTokens: 1000,
  },
  guestServiceTask: {
    model: "claude-3-5-sonnet-latest",
    provider: "anthropic",
    temperature: 0.5,
    maxTokens: 1000,
  },
  excelSheetMatchingTask: {
    model: "claude-3-5-haiku-latest",
    provider: "anthropic",
    temperature: 0.5,
    maxTokens: 1000,
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
