import { checkKey, isProviderId } from "@api-key-checker/core";
import type { CheckRequest } from "@api-key-checker/core";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import arcjet, { slidingWindow } from "@arcjet/next";

const ARCJET_KEY = process.env.ARCJET_KEY;
const RATE_LIMIT_RPM = Number(process.env.RATE_LIMIT_RPM || 20);

const aj = ARCJET_KEY
  ? arcjet({
      key: ARCJET_KEY,
      rules: [
        slidingWindow({
          mode: "LIVE",
          interval: "60s",
          max: RATE_LIMIT_RPM,
        }),
      ],
    })
  : null;

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (aj) {
    const decision = await aj.protect(request);
    if (decision.isDenied()) {
      return NextResponse.json(
        { error: "rate_limit_exceeded", message: "Too many requests. Try again in a minute." },
        { status: 429 }
      );
    }
  } else {
    console.warn("Arcjet rate limiting is disabled because ARCJET_KEY is not set.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const record = body as Record<string, unknown>;

  if (typeof record.key !== "string" || record.key.trim().length === 0 || record.key.length > 4096) {
    return NextResponse.json({ error: "invalid_key", message: "API key is required (max 4096 characters)." }, { status: 400 });
  }

  if (record.providerId !== undefined && (typeof record.providerId !== "string" || !isProviderId(record.providerId))) {
    return NextResponse.json({ error: "invalid_provider", message: "Unknown provider id." }, { status: 400 });
  }

  if (record.testGenerate !== undefined && typeof record.testGenerate !== "boolean") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const checkRequest: CheckRequest = {
    key: record.key,
    providerId: record.providerId as CheckRequest["providerId"],
    testGenerate: record.testGenerate as boolean | undefined,
  };

  const result = await checkKey(checkRequest);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
