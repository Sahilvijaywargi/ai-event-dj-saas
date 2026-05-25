import { NextResponse } from "next/server";
import { getSentryHealthStatus } from "@/lib/runtime/sentry-health";

export async function GET() {
  try {
    const status = getSentryHealthStatus();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      {
        sentryEnabled: false,
        clientConfigured: false,
        serverConfigured: false,
        environment: process.env.NODE_ENV || "development",
        tracesEnabled: false,
        configWarnings: [
          error instanceof Error ? error.message : "Sentry health validation failed.",
        ],
        runtimeReady: false,
      },
      { status: 500 },
    );
  }
}

