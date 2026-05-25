import "server-only";

type QueueEngineProviderMode = "mock" | "openrouter";

type ServerEnvShape = {
  nodeEnv: "development" | "test" | "production";
  supabaseUrl: string;
  supabaseAnonKey: string;
  openRouterApiKey: string;
  openRouterModel: string;
  spotifyClientId: string;
  spotifyClientSecret: string;
  spotifyRedirectUri: string;
  spotifyTokenEncryptionSecret: string;
  queueEngineProvider: QueueEngineProviderMode;
  sentryDsn: string;
  sentryOrg: string;
  sentryProject: string;
  sentryAuthToken: string;
};

const startupWarnings: string[] = [];

function isUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function formatEnvFailure(messages: string[]) {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    return `Environment validation failed. ${messages.length} configuration issue(s) found.`;
  }
  return `Environment validation failed:\n- ${messages.join("\n- ")}`;
}

function validateAndBuildServerEnv(): ServerEnvShape {
  const errors: string[] = [];

  const nodeEnvRaw = (process.env.NODE_ENV ?? "development").trim();
  const nodeEnv = (["development", "test", "production"].includes(nodeEnvRaw)
    ? nodeEnvRaw
    : "development") as ServerEnvShape["nodeEnv"];

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  const openRouterApiKey = (process.env.OPENROUTER_API_KEY ?? "").trim();
  const openRouterModel = (process.env.OPENROUTER_MODEL ?? "openrouter/auto").trim();
  const spotifyClientId = (process.env.SPOTIFY_CLIENT_ID ?? "").trim();
  const spotifyClientSecret = (process.env.SPOTIFY_CLIENT_SECRET ?? "").trim();
  const spotifyRedirectUri = (process.env.SPOTIFY_REDIRECT_URI ?? "").trim();
  const spotifyTokenEncryptionSecret = (process.env.SPOTIFY_TOKEN_ENCRYPTION_SECRET ?? "").trim();
  const queueEngineProviderRaw = (process.env.QUEUE_ENGINE_PROVIDER ?? "mock").trim().toLowerCase();
  const sentryDsn = (process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN ?? "").trim();
  const sentryOrg = (process.env.SENTRY_ORG ?? "").trim();
  const sentryProject = (process.env.SENTRY_PROJECT ?? "").trim();
  const sentryAuthToken = (process.env.SENTRY_AUTH_TOKEN ?? "").trim();

  if (!supabaseUrl) errors.push("Missing NEXT_PUBLIC_SUPABASE_URL.");
  if (!supabaseAnonKey) errors.push("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  if (!openRouterApiKey) errors.push("Missing OPENROUTER_API_KEY.");
  if (!spotifyClientId) errors.push("Missing SPOTIFY_CLIENT_ID.");
  if (!spotifyClientSecret) errors.push("Missing SPOTIFY_CLIENT_SECRET.");
  if (!spotifyRedirectUri) errors.push("Missing SPOTIFY_REDIRECT_URI.");
  if (!spotifyTokenEncryptionSecret) errors.push("Missing SPOTIFY_TOKEN_ENCRYPTION_SECRET.");

  if (supabaseUrl && !isUrl(supabaseUrl)) {
    errors.push("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  }
  if (supabaseUrl && supabaseUrl.includes(".supabase.com")) {
    errors.push("NEXT_PUBLIC_SUPABASE_URL must use .supabase.co.");
  }
  if (supabaseAnonKey && !supabaseAnonKey.startsWith("sb_publishable_") && !supabaseAnonKey.startsWith("eyJ")) {
    errors.push("NEXT_PUBLIC_SUPABASE_ANON_KEY format appears invalid.");
  }
  if (spotifyRedirectUri && !isUrl(spotifyRedirectUri)) {
    errors.push("SPOTIFY_REDIRECT_URI is not a valid URL.");
  }
  if (spotifyTokenEncryptionSecret && spotifyTokenEncryptionSecret.length < 24) {
    errors.push("SPOTIFY_TOKEN_ENCRYPTION_SECRET should be at least 24 characters.");
  }
  if (openRouterApiKey && !openRouterApiKey.startsWith("sk-or-")) {
    startupWarnings.push("OPENROUTER_API_KEY format is unexpected.");
  }
  if (sentryDsn && !isUrl(sentryDsn)) {
    errors.push("SENTRY_DSN (or NEXT_PUBLIC_SENTRY_DSN) is not a valid URL.");
  }
  if (!sentryDsn) {
    startupWarnings.push("Sentry disabled: SENTRY_DSN/NEXT_PUBLIC_SENTRY_DSN not configured.");
  }
  if (!sentryOrg || !sentryProject || !sentryAuthToken) {
    startupWarnings.push("Sentry sourcemap upload disabled: SENTRY_ORG/PROJECT/AUTH_TOKEN incomplete.");
  }

  const queueEngineProvider = (["mock", "openrouter"].includes(queueEngineProviderRaw)
    ? queueEngineProviderRaw
    : "mock") as QueueEngineProviderMode;
  if (!["mock", "openrouter"].includes(queueEngineProviderRaw)) {
    startupWarnings.push(`QUEUE_ENGINE_PROVIDER '${queueEngineProviderRaw}' is invalid. Falling back to 'mock'.`);
  }

  if (errors.length > 0) {
    throw new Error(formatEnvFailure(errors));
  }

  return {
    nodeEnv,
    supabaseUrl,
    supabaseAnonKey,
    openRouterApiKey,
    openRouterModel,
    spotifyClientId,
    spotifyClientSecret,
    spotifyRedirectUri,
    spotifyTokenEncryptionSecret,
    queueEngineProvider,
    sentryDsn,
    sentryOrg,
    sentryProject,
    sentryAuthToken,
  };
}

let cachedEnv: ServerEnvShape | null = null;
let startupValidated = false;

export function getServerEnv(): ServerEnvShape {
  if (!cachedEnv) {
    cachedEnv = validateAndBuildServerEnv();
  }
  if (!startupValidated) {
    startupValidated = true;
    console.info("[env] environment validation successful");
    if (startupWarnings.length > 0) {
      startupWarnings.forEach((warning) => console.warn(`[env] ${warning}`));
    }
  }
  return cachedEnv;
}

export type { QueueEngineProviderMode, ServerEnvShape };

