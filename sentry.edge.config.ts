import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;
const tracesRateRaw = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1");
const tracesSampleRate = Number.isFinite(tracesRateRaw)
  ? Math.min(1, Math.max(0, tracesRateRaw))
  : 0.1;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NODE_ENV || "development",
  tracesSampleRate,
  sendDefaultPii: false,
});

