import type {
  CheckerOptions,
  CheckRequest,
  CheckResult,
  FetchLike,
  FetchModelsResult,
  GenerateResult,
  ModelInfo,
  ProviderDefinition,
  ProviderId
} from "./types.js";
import { getProvider, toProviderSummary } from "./providers.js";
import {
  detectProviderByPrefix,
  errorFromUnknown,
  isHttpsProviderUrl,
  maskKey,
  pickBestModel,
  providerError,
  sanitizeText,
  safeProviderId,
  TEST_PROMPT,
  TRIAL_OTHER,
  TRIAL_SK
} from "./utils.js";

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

const withTimeout = <T>(timeoutMs: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return work(controller.signal).finally(() => clearTimeout(timeout));
};

const endpointUrl = (
  endpoint: ProviderDefinition["models"] | ProviderDefinition["chat"],
  input: { key: string; model?: string }
): string | undefined => endpoint?.urlBuilder?.(input) ?? endpoint?.url;

const asModelInfo = (models: string[], source: ModelInfo["source"]): ModelInfo[] =>
  models
    .map((model) => model.trim())
    .filter(Boolean)
    .map((id) => ({ id, source }));

export const fetchModels = async (
  providerId: ProviderId,
  key: string,
  options: CheckerOptions = {}
): Promise<FetchModelsResult> => {
  const provider = getProvider(providerId);

  if (!provider.models) {
    return {
      ok: true,
      providerId,
      source: "static",
      models: asModelInfo(provider.staticModels ?? [], "static")
    };
  }

  const url = endpointUrl(provider.models, { key });
  if (!url || !isHttpsProviderUrl(url)) {
    return {
      ok: false,
      providerId,
      source: "remote",
      models: [],
      error: providerError("invalid_provider_url", "Provider model endpoint is not a valid HTTPS URL.")
    };
  }

  try {
    const fetcher = options.fetch ?? defaultFetch;
    const response = await withTimeout(options.modelTimeoutMs ?? 10_000, (signal) =>
      fetcher(url, {
        method: "GET",
        headers: provider.models?.headers(key) ?? {},
        signal
      })
    );

    if (!response.ok) {
      return {
        ok: false,
        providerId,
        source: "remote",
        models: [],
        error: providerError("provider_http_error", `Provider returned HTTP ${response.status}.`, {
          statusCode: response.status,
          retryable: response.status >= 500
        })
      };
    }

    const data = await response.json();
    const models = provider.models.parse(data);
    return {
      ok: models.length > 0,
      providerId,
      source: "remote",
      models: asModelInfo(models, "remote"),
      error: models.length === 0 ? providerError("no_models", "Provider returned no usable models.") : undefined
    };
  } catch (error) {
    return {
      ok: false,
      providerId,
      source: "remote",
      models: [],
      error: errorFromUnknown(error)
    };
  }
};

export const testGenerate = async (
  providerId: ProviderId,
  key: string,
  model: string,
  options: CheckerOptions = {}
): Promise<GenerateResult> => {
  const provider = getProvider(providerId);
  const started = Date.now();

  if (!provider.chat) {
    return {
      ok: false,
      model,
      latencyMs: 0,
      error: providerError("no_generation_endpoint", "Provider has no generation endpoint configured.")
    };
  }

  const url = endpointUrl(provider.chat, { key, model });
  if (!url || !isHttpsProviderUrl(url)) {
    return {
      ok: false,
      model,
      latencyMs: 0,
      error: providerError("invalid_provider_url", "Provider generation endpoint is not a valid HTTPS URL.")
    };
  }

  try {
    const fetcher = options.fetch ?? defaultFetch;
    const response = await withTimeout(options.generationTimeoutMs ?? 65_000, (signal) =>
      fetcher(url, {
        method: "POST",
        headers: provider.chat?.headers(key) ?? {},
        body: JSON.stringify(provider.chat?.body(model, TEST_PROMPT) ?? {}),
        signal
      })
    );

    if (!response.ok) {
      return {
        ok: false,
        model,
        latencyMs: Date.now() - started,
        error: providerError("provider_http_error", `Provider returned HTTP ${response.status}.`, {
          statusCode: response.status,
          retryable: response.status >= 500
        })
      };
    }

    const data = await response.json();
    const parsed = provider.chat.parse(data);
    const answerPreview = sanitizeText(parsed, 180);
    return {
      ok: answerPreview.length > 0,
      model,
      latencyMs: Date.now() - started,
      answerPreview,
      error: answerPreview.length === 0 ? providerError("empty_generation", "Provider returned an empty generation.") : undefined
    };
  } catch (error) {
    return {
      ok: false,
      model,
      latencyMs: Date.now() - started,
      error: errorFromUnknown(error)
    };
  }
};

export const trialDetect = async (
  key: string,
  candidates: ProviderId[],
  options: CheckerOptions = {}
): Promise<{ providerId?: ProviderId; models: ModelInfo[]; attempted: ProviderId[] }> => {
  const attempted: ProviderId[] = [];
  for (const providerId of candidates) {
    attempted.push(providerId);
    const result = await fetchModels(providerId, key, {
      ...options,
      modelTimeoutMs: options.modelTimeoutMs ?? 6_000
    });
    if (result.ok && result.source === "remote" && result.models.length > 0) {
      return { providerId, models: result.models, attempted };
    }
  }
  return { models: [], attempted };
};

export const checkKey = async (request: CheckRequest, options: CheckerOptions = {}): Promise<CheckResult> => {
  const started = Date.now();
  const key = request.key.trim();
  const maskedKey = maskKey(key);

  if (!key) {
    return {
      ok: false,
      status: "missing_key",
      maskedKey,
      latencyMs: Date.now() - started,
      detection: { source: "none", attempted: [] },
      models: [],
      error: providerError("missing_key", "API key is required.")
    };
  }

  const explicitProviderId = safeProviderId(request.providerId);
  if (request.providerId && !explicitProviderId) {
    return {
      ok: false,
      status: "invalid_request",
      maskedKey,
      latencyMs: Date.now() - started,
      detection: { source: "none", attempted: [] },
      models: [],
      error: providerError("invalid_provider", "Provider id is not supported.")
    };
  }

  let providerId = explicitProviderId ?? detectProviderByPrefix(key);
  let detectionSource: CheckResult["detection"]["source"] = explicitProviderId ? "explicit" : providerId ? "prefix" : "none";
  let models: ModelInfo[] = [];
  let modelError: CheckResult["error"];
  let attempted: ProviderId[] = providerId ? [providerId] : [];

  if (!providerId) {
    const candidates = key.startsWith("sk-") ? TRIAL_SK : TRIAL_OTHER;
    const trial = await trialDetect(key, candidates, options);
    providerId = trial.providerId;
    models = trial.models;
    attempted = trial.attempted;
    detectionSource = providerId ? "trial" : "none";
  }

  if (!providerId) {
    return {
      ok: false,
      status: "unknown_provider",
      maskedKey,
      latencyMs: Date.now() - started,
      detection: { source: detectionSource, attempted },
      models: [],
      error: providerError("unknown_provider", "Provider could not be identified from prefix or trial detection.")
    };
  }

  if (models.length === 0) {
    const modelResult = await fetchModels(providerId, key, options);
    models = modelResult.models;
    modelError = modelResult.error;
  }

  const provider = getProvider(providerId);
  const selectedModel = pickBestModel(
    models.map((model) => model.id),
    providerId
  );
  const generation = request.testGenerate ? await testGenerate(providerId, key, selectedModel, options) : undefined;

  const modelsOk = models.length > 0 && !modelError;
  const ok = generation ? generation.ok : modelsOk;
  const status: CheckResult["status"] = ok ? "ok" : generation ? "generation_failed" : "models_failed";

  return {
    ok,
    status,
    maskedKey,
    latencyMs: Date.now() - started,
    detection: { source: detectionSource, attempted },
    provider: toProviderSummary(provider),
    models,
    selectedModel,
    generation,
    error: ok ? undefined : generation?.error ?? modelError ?? providerError("check_failed", "Provider check failed.")
  };
};
