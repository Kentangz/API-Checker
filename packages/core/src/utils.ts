import type { ProviderError, ProviderId } from "./types.js";
import { getProvider, isProviderId } from "./providers.js";

export const TEST_PROMPT = "Jawab hanya dengan 1 kalimat singkat saja: Apa itu kecerdasan buatan?";

export const TRIAL_SK: ProviderId[] = ["openai", "deepseek", "moonshot", "dashscope"];

export const TRIAL_OTHER: ProviderId[] = [
  "mistral",
  "fireworks",
  "together",
  "cohere",
  "siliconflow",
  "hyperbolic",
  "cerebras",
  "sambanova",
  "ai21",
  "deepinfra",
  "nebius",
  "novita",
  "zhipu"
];

export const maskKey = (key: string): string => {
  const trimmed = key.trim();
  const n = trimmed.length;
  if (n <= 16) {
    return `${trimmed.slice(0, 4)}${"*".repeat(Math.max(n - 8, 0))}${trimmed.slice(-4)}`;
  }
  return `${trimmed.slice(0, 12)}...${trimmed.slice(-4)}`;
};

export const detectProviderByPrefix = (key: string): ProviderId | undefined => {
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("sk-or-v1-")) return "openrouter";
  if (key.startsWith("sk-proj-")) return "openai";
  if (key.startsWith("sk-org-")) return "openai";
  if (key.startsWith("AIza")) return "google";
  if (key.startsWith("gsk_")) return "groq";
  if (key.startsWith("xai-")) return "xai";
  if (key.startsWith("pplx-")) return "perplexity";
  if (key.startsWith("hf_")) return "huggingface";
  if (key.startsWith("nvapi-")) return "nvidia";
  if (key.startsWith("r8_")) return "replicate";
  if (key.startsWith("ghp_")) return "github";
  if (key.startsWith("github_pat_")) return "github";
  return undefined;
};

export const pickBestModel = (models: string[], providerId: ProviderId): string => {
  const provider = getProvider(providerId);
  for (const keyword of provider.modelPreferences) {
    const match = models.find((model) => model.toLowerCase().includes(keyword.toLowerCase()));
    if (match) {
      return match;
    }
  }
  return models[0] ?? provider.defaultModel;
};

export const sanitizeText = (value: string, maxLength = 180): string => {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 3)}...` : compact;
};

export const providerError = (
  code: string,
  message: string,
  options: Pick<ProviderError, "statusCode" | "retryable"> = {}
): ProviderError => ({
  code,
  message,
  ...options
});

export const errorFromUnknown = (error: unknown, code = "unexpected_error"): ProviderError => {
  if (error instanceof DOMException && error.name === "AbortError") {
    return providerError("timeout", "Provider request timed out.", { retryable: true });
  }
  if (error instanceof Error) {
    return providerError(code, sanitizeText(error.name || "Unexpected error"));
  }
  return providerError(code, "Unexpected provider error.");
};

export const safeProviderId = (value: unknown): ProviderId | undefined =>
  typeof value === "string" && isProviderId(value) ? value : undefined;

export const isHttpsProviderUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
};
