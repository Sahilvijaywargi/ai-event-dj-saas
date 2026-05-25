import "server-only";

import * as Sentry from "@sentry/nextjs";
import { getServerEnv } from "@/lib/env/server";

export type SentryHealthStatus = {
  sentryEnabled: boolean;
  clientConfigured: boolean;
  serverConfigured: boolean;
  environment: "development" | "test" | "production";
  tracesEnabled: boolean;
  configWarnings: string[];
  runtimeReady: boolean;
};

function safeSampleRate(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? String(fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
}

export function getSentryHealthStatus(): SentryHealthStatus {
  const env = getServerEnv();
  const dsn = (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || "").trim();
  const clientDsn = (process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || "").trim();
  const tracesSampleRate = safeSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1);
  const clientTracesSampleRate = safeSampleRate(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE, 0.05);
  const warnings: string[] = [];

  const sentryEnabled = Boolean(dsn);
  const clientConfigured = Boolean(clientDsn);
  const serverConfigured = Boolean(dsn);

  if (!sentryEnabled) warnings.push("SENTRY_DSN/NEXT_PUBLIC_SENTRY_DSN not configured.");
  if (!clientConfigured) warnings.push("Client DSN missing; browser error capture disabled.");
  if (!serverConfigured) warnings.push("Server DSN missing; API/server error capture disabled.");
  if (tracesSampleRate <= 0 && clientTracesSampleRate <= 0) {
    warnings.push("Tracing sample rates are zero; performance tracing disabled.");
  }

  const sentryClient = typeof Sentry.getClient === "function" ? Sentry.getClient() : undefined;
  const initReady = Boolean(sentryClient);
  if (sentryEnabled && !initReady) {
    warnings.push("Sentry SDK not initialized in current runtime yet.");
  }

  const runtimeReady = sentryEnabled ? serverConfigured && initReady : true;

  return {
    sentryEnabled,
    clientConfigured,
    serverConfigured,
    environment: env.nodeEnv,
    tracesEnabled: tracesSampleRate > 0 || clientTracesSampleRate > 0,
    configWarnings: warnings,
    runtimeReady,
  };
}

