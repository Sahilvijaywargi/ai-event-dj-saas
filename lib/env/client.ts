type ClientEnvShape = {
  nodeEnv: "development" | "test" | "production";
  supabaseUrl: string;
  supabaseAnonKey: string;
  sentryDsn: string;
  queueEngineProvider: "mock" | "openrouter";
};

function formatClientEnvFailure(messages: string[]) {
  return `Client-safe environment validation failed:\n- ${messages.join("\n- ")}`;
}

function buildClientEnv(): ClientEnvShape {
  const errors: string[] = [];
  const nodeEnvRaw = (process.env.NODE_ENV ?? "development").trim();
  const nodeEnv = (["development", "test", "production"].includes(nodeEnvRaw)
    ? nodeEnvRaw
    : "development") as ClientEnvShape["nodeEnv"];
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  const sentryDsn = (process.env.NEXT_PUBLIC_SENTRY_DSN ?? "").trim();
  const queueEngineProviderRaw = (process.env.NEXT_PUBLIC_QUEUE_ENGINE_PROVIDER ?? "mock").trim().toLowerCase();
  const queueEngineProvider = (["mock", "openrouter"].includes(queueEngineProviderRaw)
    ? queueEngineProviderRaw
    : "mock") as ClientEnvShape["queueEngineProvider"];

  if (!supabaseUrl) errors.push("Missing NEXT_PUBLIC_SUPABASE_URL.");
  if (!supabaseAnonKey) errors.push("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  if (errors.length > 0) {
    throw new Error(formatClientEnvFailure(errors));
  }

  return {
    nodeEnv,
    supabaseUrl,
    supabaseAnonKey,
    sentryDsn,
    queueEngineProvider,
  };
}

let cachedClientEnv: ClientEnvShape | null = null;

export function getClientEnv(): ClientEnvShape {
  if (!cachedClientEnv) {
    cachedClientEnv = buildClientEnv();
  }
  return cachedClientEnv;
}

export type { ClientEnvShape };

