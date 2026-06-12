# API Key Checker

A public web tool to validate API keys from 27+ AI providers — no login, no install, no setup.

Paste your API key, select a provider (or let the tool auto-detect), and get instant validation results including available models and an optional generation test.

## Supported Providers

Anthropic · OpenAI · Google Gemini · xAI · OpenRouter · Groq · Cerebras · SambaNova · Fireworks · Together · NVIDIA · DeepInfra · Hyperbolic · Nebius · Novita · SiliconFlow · DeepSeek · Mistral · Perplexity · Cohere · AI21 · Hugging Face · Replicate · Moonshot · Zhipu · DashScope · GitHub Models

## Architecture

- `apps/web` — Next.js app deployed on Vercel (UI + API Routes)
- `packages/core` — Typed provider registry, key detection, model listing, and generation tests

API key checks run in Vercel serverless functions (`/api/check`), which call the provider directly and return results to the browser.

## Requirements

- Node.js 24 or newer
- Corepack
- pnpm 11.5.2 through Corepack

## Local Development

```bash
corepack enable
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).


### Environment Variables

| Variable         | Default       | Description                              |
| ---------------- | ------------- | ---------------------------------------- |
| `RATE_LIMIT_RPM` | `20`          | Max check requests per IP per minute     |
| `ARCJET_KEY`     | *(Optional)*  | SDK Key from Arcjet for rate limiting    |
| `ARCJET_ENV`     | `development` | Used locally to allow loopback/local IPs |

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Security

API keys submitted to this tool are:

- Transmitted over HTTPS to Vercel serverless functions
- Used only to make a single verification request to the provider
- Never logged, stored, or persisted
- Discarded immediately after the check completes

See [SECURITY.md](SECURITY.md) for the full policy and vulnerability reporting.
