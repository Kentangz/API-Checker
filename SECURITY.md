# Security Policy

## Supported Versions

Security fixes target the default branch until the project starts publishing versioned releases.

## Reporting a Vulnerability

Use GitHub private vulnerability reporting when the repository is public. If that is not enabled, contact the maintainer privately before opening a public issue.

Do not include working API keys, account tokens, or provider secrets in reports. Redact tokens before attaching logs or screenshots.

## How API Keys Are Handled

API keys submitted through the web interface are:

- Transmitted over HTTPS to Vercel serverless functions
- Used only to make a single verification request to the provider
- Never logged, stored, or persisted in any database
- Discarded immediately after the check completes

The server returns only the check result (masked key, provider info, model list) — the original key is never echoed back or retained.

## Rate Limiting

The `/api/check` endpoint applies per-IP rate limiting (default: 20 requests per minute) to prevent abuse.

## Repository Settings

Before publishing, enable GitHub secret scanning and push protection for the public repository. Enable Dependabot alerts and security updates.
