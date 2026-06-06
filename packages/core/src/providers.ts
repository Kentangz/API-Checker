import type { ProviderDefinition, ProviderId, ProviderSummary } from "./types.js";
import { PROVIDER_IDS } from "./types.js";

const jsonHeaders = { "Content-Type": "application/json" };

const bearer = (key: string) => ({ Authorization: `Bearer ${key}` });
const bearerJson = (key: string) => ({ ...bearer(key), ...jsonHeaders });
const openAiChatBody = (model: string, prompt: string) => ({
  model,
  max_tokens: 256,
  messages: [{ role: "user", content: prompt }]
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asRecordArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const stringField = (value: unknown, field: string): string | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const candidate = value[field];
  return typeof candidate === "string" ? candidate : undefined;
};

const dataIds = (limit?: number, filter?: (id: string) => boolean) => (data: unknown): string[] => {
  const rows = isRecord(data) ? asRecordArray(data.data) : [];
  const ids = rows.map((row) => stringField(row, "id")).filter((id): id is string => Boolean(id));
  const filtered = filter ? ids.filter(filter) : ids;
  return typeof limit === "number" ? filtered.slice(0, limit) : filtered;
};

const choicesMessage = (data: unknown): string => {
  const choices = isRecord(data) ? asRecordArray(data.choices) : [];
  const message = choices[0]?.message;
  return stringField(message, "content") ?? "";
};

const openAiCompatible = (input: {
  id: ProviderId;
  name: string;
  category: ProviderDefinition["category"];
  modelsUrl?: string;
  chatUrl: string;
  defaultModel: string;
  modelPreferences: string[];
  modelLimit?: number;
  modelParser?: (data: unknown) => string[];
}): ProviderDefinition => ({
  id: input.id,
  name: input.name,
  category: input.category,
  defaultModel: input.defaultModel,
  modelPreferences: input.modelPreferences,
  models: input.modelsUrl
    ? {
        url: input.modelsUrl,
        headers: bearer,
        parse: input.modelParser ?? dataIds(input.modelLimit)
      }
    : undefined,
  chat: {
    url: input.chatUrl,
    headers: bearerJson,
    body: openAiChatBody,
    parse: choicesMessage
  }
});

export const PROVIDERS: Record<ProviderId, ProviderDefinition> = {
  anthropic: {
    id: "anthropic",
    name: "Anthropic (Claude)",
    category: "proprietary",
    defaultModel: "claude-3-5-haiku-20241022",
    modelPreferences: ["haiku", "sonnet"],
    models: {
      url: "https://api.anthropic.com/v1/models",
      headers: (key) => ({ "x-api-key": key, "anthropic-version": "2023-06-01" }),
      parse: dataIds()
    },
    chat: {
      url: "https://api.anthropic.com/v1/messages",
      headers: (key) => ({
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        ...jsonHeaders
      }),
      body: (model, prompt) => ({
        model,
        max_tokens: 256,
        messages: [{ role: "user", content: prompt }]
      }),
      parse: (data) => {
        const content = isRecord(data) ? asRecordArray(data.content) : [];
        return stringField(content[0], "text") ?? "";
      }
    }
  },
  openai: openAiCompatible({
    id: "openai",
    name: "OpenAI",
    category: "proprietary",
    modelsUrl: "https://api.openai.com/v1/models",
    chatUrl: "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-4o-mini",
    modelPreferences: ["gpt-4o-mini", "gpt-3.5-turbo", "gpt-4o"],
    modelParser: (data) => dataIds(undefined, (id) => id.includes("gpt"))(data).sort().reverse().slice(0, 12)
  }),
  google: {
    id: "google",
    name: "Google Gemini",
    category: "proprietary",
    defaultModel: "gemini-1.5-flash",
    modelPreferences: ["flash", "1.5"],
    models: {
      urlBuilder: ({ key }) => `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
      headers: () => ({}),
      parse: (data) => {
        const models = isRecord(data) ? asRecordArray(data.models) : [];
        return models
          .map((model) => stringField(model, "name") ?? "")
          .filter((name) => name.toLowerCase().includes("gemini"))
          .map((name) => name.split("/").at(-1) ?? name);
      }
    },
    chat: {
      urlBuilder: ({ key, model }) =>
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model ?? "")}:generateContent?key=${encodeURIComponent(key)}`,
      headers: () => jsonHeaders,
      body: (_model, prompt) => ({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 256 }
      }),
      parse: (data) => {
        const candidates = isRecord(data) ? asRecordArray(data.candidates) : [];
        const content = candidates[0]?.content;
        const parts = isRecord(content) ? asRecordArray(content.parts) : [];
        return stringField(parts[0], "text") ?? "";
      }
    }
  },
  xai: openAiCompatible({
    id: "xai",
    name: "xAI (Grok)",
    category: "proprietary",
    modelsUrl: "https://api.x.ai/v1/models",
    chatUrl: "https://api.x.ai/v1/chat/completions",
    defaultModel: "grok-beta",
    modelPreferences: ["grok"]
  }),
  openrouter: {
    ...openAiCompatible({
      id: "openrouter",
      name: "OpenRouter",
      category: "aggregator",
      modelsUrl: "https://openrouter.ai/api/v1/models",
      chatUrl: "https://openrouter.ai/api/v1/chat/completions",
      defaultModel: "meta-llama/llama-3.1-8b-instruct:free",
      modelPreferences: ["free", "8b", "llama", "mistral"],
      modelLimit: 15
    }),
    chat: {
      url: "https://openrouter.ai/api/v1/chat/completions",
      headers: (key) => ({
        ...bearerJson(key),
        "HTTP-Referer": "https://api-key-checker.local"
      }),
      body: openAiChatBody,
      parse: choicesMessage
    }
  },
  github: {
    id: "github",
    name: "GitHub Models",
    category: "aggregator",
    defaultModel: "openai/gpt-4o-mini",
    modelPreferences: ["mini", "gpt-4o-mini", "llama"],
    staticModels: [
      "openai/gpt-4o-mini",
      "openai/gpt-4o",
      "meta/llama-3.3-70b-instruct",
      "mistral-ai/mistral-small",
      "anthropic/claude-3-5-haiku",
      "deepseek/deepseek-v3"
    ],
    chat: {
      url: "https://models.github.ai/inference/chat/completions",
      headers: bearerJson,
      body: openAiChatBody,
      parse: choicesMessage
    }
  },
  groq: openAiCompatible({
    id: "groq",
    name: "Groq",
    category: "fast-inference",
    modelsUrl: "https://api.groq.com/openai/v1/models",
    chatUrl: "https://api.groq.com/openai/v1/chat/completions",
    defaultModel: "llama-3.1-8b-instant",
    modelPreferences: ["8b", "instant", "llama"]
  }),
  cerebras: openAiCompatible({
    id: "cerebras",
    name: "Cerebras",
    category: "fast-inference",
    modelsUrl: "https://api.cerebras.ai/v1/models",
    chatUrl: "https://api.cerebras.ai/v1/chat/completions",
    defaultModel: "llama3.1-8b",
    modelPreferences: ["8b", "llama"]
  }),
  sambanova: openAiCompatible({
    id: "sambanova",
    name: "SambaNova",
    category: "fast-inference",
    modelsUrl: "https://api.sambanova.ai/v1/models",
    chatUrl: "https://api.sambanova.ai/v1/chat/completions",
    defaultModel: "Meta-Llama-3.1-8B-Instruct",
    modelPreferences: ["8b", "llama"]
  }),
  fireworks: openAiCompatible({
    id: "fireworks",
    name: "Fireworks AI",
    category: "open-source-inference",
    modelsUrl: "https://api.fireworks.ai/inference/v1/models",
    chatUrl: "https://api.fireworks.ai/inference/v1/chat/completions",
    defaultModel: "accounts/fireworks/models/llama-v3p1-8b-instruct",
    modelPreferences: ["8b", "llama", "v3p1"],
    modelLimit: 12
  }),
  together: openAiCompatible({
    id: "together",
    name: "Together AI",
    category: "open-source-inference",
    modelsUrl: "https://api.together.xyz/v1/models",
    chatUrl: "https://api.together.xyz/v1/chat/completions",
    defaultModel: "meta-llama/Llama-3-8b-chat-hf",
    modelPreferences: ["8b", "llama"],
    modelParser: (data) => {
      const rows = Array.isArray(data) ? asRecordArray(data) : isRecord(data) ? asRecordArray(data.data) : [];
      return rows.map((row) => stringField(row, "id")).filter((id): id is string => Boolean(id)).slice(0, 12);
    }
  }),
  nvidia: openAiCompatible({
    id: "nvidia",
    name: "NVIDIA NIM",
    category: "open-source-inference",
    modelsUrl: "https://integrate.api.nvidia.com/v1/models",
    chatUrl: "https://integrate.api.nvidia.com/v1/chat/completions",
    defaultModel: "meta/llama-3.1-8b-instruct",
    modelPreferences: ["8b", "llama", "mistral"],
    modelLimit: 12
  }),
  deepinfra: openAiCompatible({
    id: "deepinfra",
    name: "DeepInfra",
    category: "open-source-inference",
    modelsUrl: "https://api.deepinfra.com/v1/openai/models",
    chatUrl: "https://api.deepinfra.com/v1/openai/chat/completions",
    defaultModel: "meta-llama/Meta-Llama-3-8B-Instruct",
    modelPreferences: ["8b", "llama", "mistral"],
    modelLimit: 12
  }),
  hyperbolic: openAiCompatible({
    id: "hyperbolic",
    name: "Hyperbolic",
    category: "open-source-inference",
    modelsUrl: "https://api.hyperbolic.xyz/v1/models",
    chatUrl: "https://api.hyperbolic.xyz/v1/chat/completions",
    defaultModel: "meta-llama/Llama-3.1-8B-Instruct",
    modelPreferences: ["8b", "llama", "mistral"],
    modelLimit: 12
  }),
  nebius: openAiCompatible({
    id: "nebius",
    name: "Nebius (Token Factory)",
    category: "open-source-inference",
    modelsUrl: "https://api.tokenfactory.nebius.com/v1/models",
    chatUrl: "https://api.tokenfactory.nebius.com/v1/chat/completions",
    defaultModel: "meta-llama/Meta-Llama-3.1-8B-Instruct-fast",
    modelPreferences: ["8b", "fast", "llama"],
    modelLimit: 12
  }),
  novita: openAiCompatible({
    id: "novita",
    name: "Novita AI",
    category: "open-source-inference",
    modelsUrl: "https://api.novita.ai/v3/openai/models",
    chatUrl: "https://api.novita.ai/v3/openai/chat/completions",
    defaultModel: "meta-llama/llama-3.1-8b-instruct",
    modelPreferences: ["8b", "llama", "mistral"],
    modelLimit: 12
  }),
  siliconflow: openAiCompatible({
    id: "siliconflow",
    name: "SiliconFlow",
    category: "open-source-inference",
    modelsUrl: "https://api.siliconflow.cn/v1/models",
    chatUrl: "https://api.siliconflow.cn/v1/chat/completions",
    defaultModel: "Qwen/Qwen2.5-7B-Instruct",
    modelPreferences: ["7b", "qwen", "llama"],
    modelLimit: 12
  }),
  deepseek: openAiCompatible({
    id: "deepseek",
    name: "DeepSeek",
    category: "model-lab",
    modelsUrl: "https://api.deepseek.com/models",
    chatUrl: "https://api.deepseek.com/chat/completions",
    defaultModel: "deepseek-chat",
    modelPreferences: ["deepseek-chat"]
  }),
  mistral: openAiCompatible({
    id: "mistral",
    name: "Mistral AI",
    category: "model-lab",
    modelsUrl: "https://api.mistral.ai/v1/models",
    chatUrl: "https://api.mistral.ai/v1/chat/completions",
    defaultModel: "mistral-small-latest",
    modelPreferences: ["small", "tiny"]
  }),
  perplexity: {
    id: "perplexity",
    name: "Perplexity AI",
    category: "model-lab",
    defaultModel: "sonar",
    modelPreferences: ["sonar"],
    staticModels: ["sonar", "sonar-pro", "sonar-reasoning", "llama-3.1-sonar-large-128k-online"],
    chat: {
      url: "https://api.perplexity.ai/chat/completions",
      headers: bearerJson,
      body: openAiChatBody,
      parse: choicesMessage
    }
  },
  cohere: {
    id: "cohere",
    name: "Cohere",
    category: "model-lab",
    defaultModel: "command-r",
    modelPreferences: ["command-r"],
    models: {
      url: "https://api.cohere.ai/v2/models",
      headers: bearer,
      parse: (data) => {
        const models = isRecord(data) ? asRecordArray(data.models) : [];
        return models.map((model) => stringField(model, "name")).filter((name): name is string => Boolean(name)).slice(0, 12);
      }
    },
    chat: {
      url: "https://api.cohere.com/v2/chat",
      headers: bearerJson,
      body: openAiChatBody,
      parse: (data) => {
        const message = isRecord(data) ? data.message : undefined;
        const content = isRecord(message) ? asRecordArray(message.content) : [];
        return stringField(content[0], "text") ?? "";
      }
    }
  },
  ai21: {
    id: "ai21",
    name: "AI21 Labs",
    category: "model-lab",
    defaultModel: "jamba-1.5-mini",
    modelPreferences: ["mini", "jamba"],
    staticModels: ["jamba-1.5-mini", "jamba-1.5-large", "jamba-instruct"],
    chat: {
      url: "https://api.ai21.com/studio/v1/chat/completions",
      headers: bearerJson,
      body: openAiChatBody,
      parse: choicesMessage
    }
  },
  huggingface: {
    id: "huggingface",
    name: "Hugging Face",
    category: "platform",
    defaultModel: "meta-llama/Llama-3.1-8B-Instruct",
    modelPreferences: ["llama", "phi", "mistral", "gemma"],
    models: {
      url: "https://huggingface.co/api/models?pipeline_tag=text-generation&sort=trending&limit=8&language=en",
      headers: bearer,
      parse: (data) =>
        asRecordArray(data)
          .map((model) => stringField(model, "id"))
          .filter((id): id is string => Boolean(id))
          .slice(0, 8)
    },
    chat: {
      url: "https://api-inference.huggingface.co/v1/chat/completions",
      headers: bearerJson,
      body: openAiChatBody,
      parse: choicesMessage
    }
  },
  replicate: {
    id: "replicate",
    name: "Replicate",
    category: "platform",
    defaultModel: "meta/meta-llama-3-8b-instruct",
    modelPreferences: ["llama-3", "llama-2"],
    models: {
      url: "https://api.replicate.com/v1/account",
      headers: (key) => ({ Authorization: `Token ${key}` }),
      parse: (data) =>
        isRecord(data) && (data.username || data.type)
          ? [
              "meta/meta-llama-3-8b-instruct",
              "mistralai/mistral-7b-instruct-v0.2",
              "meta/llama-2-13b-chat"
            ]
          : []
    },
    chat: {
      urlBuilder: ({ model }) => `https://api.replicate.com/v1/models/${model ?? ""}/predictions`,
      headers: (key) => ({
        Authorization: `Token ${key}`,
        ...jsonHeaders,
        Prefer: "wait=55"
      }),
      body: (_model, prompt) => ({ input: { prompt, max_new_tokens: 200 } }),
      parse: (data) => {
        if (!isRecord(data)) {
          return "";
        }
        if (data.status === "succeeded" && Array.isArray(data.output)) {
          return data.output.map((part) => String(part)).join("");
        }
        return `[status=${String(data.status ?? "unknown")}]`;
      }
    }
  },
  moonshot: openAiCompatible({
    id: "moonshot",
    name: "Moonshot AI (Kimi)",
    category: "asian-provider",
    modelsUrl: "https://api.moonshot.ai/v1/models",
    chatUrl: "https://api.moonshot.ai/v1/chat/completions",
    defaultModel: "moonshot-v1-8k",
    modelPreferences: ["8k", "moonshot"]
  }),
  zhipu: {
    id: "zhipu",
    name: "Zhipu AI / Z.ai (GLM)",
    category: "asian-provider",
    defaultModel: "glm-4-flash",
    modelPreferences: ["flash", "air"],
    staticModels: ["glm-4-flash", "glm-4-air", "glm-4.5", "glm-4.5-air"],
    chat: {
      url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      headers: bearerJson,
      body: openAiChatBody,
      parse: choicesMessage
    }
  },
  dashscope: openAiCompatible({
    id: "dashscope",
    name: "Alibaba DashScope (Qwen)",
    category: "asian-provider",
    modelsUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models",
    chatUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
    defaultModel: "qwen-turbo",
    modelPreferences: ["turbo", "qwen"],
    modelLimit: 12
  })
};

export const providerIds = PROVIDER_IDS;

export const isProviderId = (value: string): value is ProviderId =>
  (PROVIDER_IDS as readonly string[]).includes(value);

export const getProvider = (id: ProviderId): ProviderDefinition => PROVIDERS[id];

export const toProviderSummary = (provider: ProviderDefinition): ProviderSummary => ({
  id: provider.id,
  name: provider.name,
  category: provider.category,
  defaultModel: provider.defaultModel,
  modelPreferences: provider.modelPreferences,
  hasRemoteModels: Boolean(provider.models),
  hasGenerationTest: Boolean(provider.chat)
});

export const listProviders = (): ProviderSummary[] => providerIds.map((id) => toProviderSummary(PROVIDERS[id]));
