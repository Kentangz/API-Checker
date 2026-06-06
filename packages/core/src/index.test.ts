import { describe, expect, it, vi } from "vitest";
import {
  checkKey,
  detectProviderByPrefix,
  fetchModels,
  maskKey,
  pickBestModel,
  providerIds,
  testGenerate
} from "./index.js";
import type { FetchLike } from "./types.js";

const okJson = (data: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: "OK",
  json: async () => data
});

describe("provider registry", () => {
  it("keeps all 27 providers from the Python checker", () => {
    expect(providerIds).toHaveLength(27);
    expect(new Set(providerIds).size).toBe(27);
  });
});

describe("key utilities", () => {
  it("masks short and long keys without exposing the middle", () => {
    expect(maskKey("abcd1234")).toBe("abcd1234");
    expect(maskKey("sk-proj-1234567890abcdef")).toBe("sk-proj-123...cdef");
  });

  it("detects known provider prefixes", () => {
    expect(detectProviderByPrefix("sk-ant-test")).toBe("anthropic");
    expect(detectProviderByPrefix("sk-or-v1-test")).toBe("openrouter");
    expect(detectProviderByPrefix("AIza-test")).toBe("google");
    expect(detectProviderByPrefix("github_pat_test")).toBe("github");
  });

  it("picks preferred models before falling back", () => {
    expect(pickBestModel(["foo", "gpt-4o-mini"], "openai")).toBe("gpt-4o-mini");
    expect(pickBestModel([], "openai")).toBe("gpt-4o-mini");
  });
});

describe("model and generation calls", () => {
  it("parses OpenAI model lists", async () => {
    const fetcher: FetchLike = vi.fn(async () =>
      okJson({ data: [{ id: "not-relevant" }, { id: "gpt-4o-mini" }, { id: "gpt-4o" }] })
    );

    const result = await fetchModels("openai", "sk-proj-test", { fetch: fetcher });

    expect(result.ok).toBe(true);
    expect(result.models.map((model) => model.id)).toEqual(["gpt-4o-mini", "gpt-4o"]);
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer sk-proj-test" }
      })
    );
  });

  it("returns static models without calling remote endpoints", async () => {
    const fetcher: FetchLike = vi.fn();
    const result = await fetchModels("perplexity", "pplx-test", { fetch: fetcher });

    expect(result.ok).toBe(true);
    expect(result.source).toBe("static");
    expect(result.models[0]?.id).toBe("sonar");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("parses generation responses without returning full provider payloads", async () => {
    const fetcher: FetchLike = vi.fn(async () => okJson({ choices: [{ message: { content: "AI is a field of computer science." } }] }));

    const result = await testGenerate("openai", "sk-proj-test", "gpt-4o-mini", { fetch: fetcher });

    expect(result.ok).toBe(true);
    expect(result.answerPreview).toBe("AI is a field of computer science.");
  });
});

describe("checkKey", () => {
  it("checks by prefix and masks the key in the response", async () => {
    const fetcher = (vi
      .fn()
      .mockResolvedValueOnce(okJson({ data: [{ id: "gpt-4o-mini" }] }))
      .mockResolvedValueOnce(
        okJson({ choices: [{ message: { content: "Artificial intelligence helps machines reason." } }] })
      )) as unknown as FetchLike;

    const result = await checkKey(
      {
        key: "sk-proj-1234567890abcdef",
        testGenerate: true
      },
      { fetch: fetcher }
    );

    expect(result.ok).toBe(true);
    expect(result.provider?.id).toBe("openai");
    expect(result.maskedKey).toBe("sk-proj-123...cdef");
    expect(JSON.stringify(result)).not.toContain("1234567890ab");
  });
});
