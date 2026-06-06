"use client";

import { AlertTriangle, CheckCircle2, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CheckResult, ProviderId, ProviderSummary } from "@api-key-checker/core";

type AsyncState = "idle" | "loading" | "success" | "error";

const statusText = (result: CheckResult | undefined): string => {
  if (!result) return "No result";
  if (result.ok) return "Valid";
  return result.error?.message ?? result.status;
};

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [providerId, setProviderId] = useState<ProviderId | "">("");
  const [testGenerate, setTestGenerate] = useState(false);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [checkState, setCheckState] = useState<AsyncState>("idle");
  const [result, setResult] = useState<CheckResult>();
  const [message, setMessage] = useState("");

  const providerOptions = useMemo(
    () => [...providers].sort((a, b) => a.name.localeCompare(b.name)),
    [providers]
  );

  useEffect(() => {
    fetch("/api/providers")
      .then((r) => r.json() as Promise<{ providers: ProviderSummary[] }>)
      .then((data) => setProviders(data.providers))
      .catch(() => {});
  }, []);

  const check = async () => {
    setCheckState("loading");
    setMessage("");
    setResult(undefined);
    try {
      const response = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: apiKey,
          providerId: providerId || undefined,
          testGenerate,
        }),
      });
      const data = (await response.json()) as CheckResult & { error?: { message?: string } };
      if (!response.ok && !("maskedKey" in data)) {
        setCheckState("error");
        setMessage((data as { message?: string }).message ?? "Check failed.");
        return;
      }
      setResult(data);
      setCheckState(data.ok ? "success" : "error");
      setMessage(statusText(data));
    } catch {
      setCheckState("error");
      setMessage("Request failed. Please try again.");
    }
  };

  return (
    <main className="shell">
      <section className="topbar" aria-label="Application header">
        <div>
          <p className="eyebrow">Public API checker</p>
          <h1>API Key Checker</h1>
        </div>

      </section>

      <section className="grid">
        <form
          className="panel controls"
          onSubmit={(event) => {
            event.preventDefault();
            void check();
          }}
        >
          <div className="panelHeader">
            <KeyRound size={18} />
            <h2>Check API Key</h2>
          </div>

          <label>
            <span>Provider</span>
            <select
              value={providerId}
              onChange={(event) => setProviderId(event.target.value as ProviderId | "")}
            >
              <option value="">Auto detect</option>
              {providerOptions.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>API key</span>
            <textarea
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Paste your API key here"
              spellCheck={false}
            />
          </label>

          <label className="checkline">
            <input
              checked={testGenerate}
              onChange={(event) => setTestGenerate(event.target.checked)}
              type="checkbox"
            />
            <span>Run generation test (slower)</span>
          </label>

          <button
            className="primaryButton"
            disabled={checkState === "loading" || !apiKey.trim()}
            type="submit"
          >
            {checkState === "loading" ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <CheckCircle2 size={16} />
            )}
            Check key
          </button>
        </form>

        <section className="panel results" aria-live="polite">
          <div className="panelHeader">
            {result?.ok ? (
              <CheckCircle2 className="successIcon" size={18} />
            ) : (
              <AlertTriangle className="warnIcon" size={18} />
            )}
            <h2>Result</h2>
          </div>

          <div
            className="resultStatus"
            data-state={result?.ok ? "success" : checkState === "error" ? "error" : "idle"}
          >
            <strong>{statusText(result)}</strong>
            <span>{message || "Enter your API key and click Check."}</span>
          </div>

          <dl className="facts">
            <div>
              <dt>Masked key</dt>
              <dd>{result?.maskedKey || "-"}</dd>
            </div>
            <div>
              <dt>Provider</dt>
              <dd>{result?.provider?.name || "-"}</dd>
            </div>
            <div>
              <dt>Detection</dt>
              <dd>{result?.detection.source || "-"}</dd>
            </div>
            <div>
              <dt>Selected model</dt>
              <dd>{result?.selectedModel || "-"}</dd>
            </div>
            <div>
              <dt>Latency</dt>
              <dd>{result ? `${result.latencyMs} ms` : "-"}</dd>
            </div>
            <div>
              <dt>Generation</dt>
              <dd>
                {result?.generation
                  ? result.generation.ok
                    ? "OK"
                    : (result.generation.error?.message ?? "Failed")
                  : "-"}
              </dd>
            </div>
          </dl>

          {result?.generation?.answerPreview ? (
            <div className="answer">
              <span>Answer preview</span>
              <p>{result.generation.answerPreview}</p>
            </div>
          ) : null}

          <div className="modelList">
            <span>Models</span>
            <ul>
              {(result?.models ?? []).slice(0, 8).map((model) => (
                <li key={model.id}>{model.id}</li>
              ))}
              {result && result.models.length === 0 ? <li>No models returned</li> : null}
            </ul>
          </div>
        </section>
      </section>

      <section className="securityBand" aria-label="Transparency">
        <div>
          <ShieldCheck size={18} />
          <span>API keys are used for verification only and never stored.</span>
        </div>
        <div>
          <ShieldCheck size={18} />
          <span>Checks run on Vercel serverless — no local setup required.</span>
        </div>
      </section>
    </main>
  );
}
