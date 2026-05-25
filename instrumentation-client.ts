import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || undefined;
const tracesRateRaw = Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.05");
const tracesSampleRate = Number.isFinite(tracesRateRaw)
  ? Math.min(1, Math.max(0, tracesRateRaw))
  : 0.05;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NODE_ENV || "development",
  tracesSampleRate,
  sendDefaultPii: false,
});

