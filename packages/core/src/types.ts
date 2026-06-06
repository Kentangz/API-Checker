export const PROVIDER_IDS = [
  "anthropic",
  "openai",
  "google",
  "xai",
  "openrouter",
  "github",
  "groq",
  "cerebras",
  "sambanova",
  "fireworks",
  "together",
  "nvidia",
  "deepinfra",
  "hyperbolic",
  "nebius",
  "novita",
  "siliconflow",
  "deepseek",
  "mistral",
  "perplexity",
  "cohere",
  "ai21",
  "huggingface",
  "replicate",
  "moonshot",
  "zhipu",
  "dashscope"
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export type ProviderCategory =
  | "proprietary"
  | "aggregator"
  | "fast-inference"
  | "open-source-inference"
  | "model-lab"
  | "platform"
  | "asian-provider";

export type ModelSource = "remote" | "static";

export interface ModelInfo {
  id: string;
  source: ModelSource;
}

export interface ProviderError {
  code: string;
  message: string;
  statusCode?: number;
  retryable?: boolean;
}

export interface ProviderEndpoint {
  url?: string;
  urlBuilder?: (input: { key: string; model?: string }) => string;
  headers: (key: string) => Record<string, string>;
}

export interface ProviderModelEndpoint extends ProviderEndpoint {
  parse: (data: unknown) => string[];
}

export interface ProviderChatEndpoint extends ProviderEndpoint {
  body: (model: string, prompt: string) => unknown;
  parse: (data: unknown) => string;
}

export interface ProviderDefinition {
  id: ProviderId;
  name: string;
  category: ProviderCategory;
  defaultModel: string;
  modelPreferences: string[];
  models?: ProviderModelEndpoint;
  staticModels?: string[];
  chat?: ProviderChatEndpoint;
}

export interface ProviderSummary {
  id: ProviderId;
  name: string;
  category: ProviderCategory;
  defaultModel: string;
  modelPreferences: string[];
  hasRemoteModels: boolean;
  hasGenerationTest: boolean;
}

export interface CheckRequest {
  key: string;
  providerId?: ProviderId;
  testGenerate?: boolean;
}

export interface FetchModelsResult {
  ok: boolean;
  providerId: ProviderId;
  models: ModelInfo[];
  source: ModelSource;
  error?: ProviderError;
}

export interface GenerateResult {
  ok: boolean;
  model: string;
  latencyMs: number;
  answerPreview?: string;
  error?: ProviderError;
}

export interface CheckResult {
  ok: boolean;
  status:
    | "ok"
    | "missing_key"
    | "unknown_provider"
    | "models_failed"
    | "generation_failed"
    | "invalid_request";
  maskedKey: string;
  latencyMs: number;
  detection: {
    source: "explicit" | "prefix" | "trial" | "none";
    attempted: ProviderId[];
  };
  provider?: ProviderSummary;
  models: ModelInfo[];
  selectedModel?: string;
  generation?: GenerateResult;
  error?: ProviderError;
}

export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
}>;

export interface CheckerOptions {
  fetch?: FetchLike;
  modelTimeoutMs?: number;
  generationTimeoutMs?: number;
}
