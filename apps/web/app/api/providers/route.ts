import { listProviders } from "@api-key-checker/core";
import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ providers: listProviders() });
}
