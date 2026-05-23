function assertValidUrl(value: string) {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      "Invalid NEXT_PUBLIC_SUPABASE_URL. Set it to your Supabase project URL (for example, https://your-project-ref.supabase.co).",
    );
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must start with http:// or https://.");
  }

  if (parsed.hostname.endsWith(".supabase.com")) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL appears incorrect. Supabase project URLs should use .supabase.co (not .supabase.com).",
    );
  }
}

function assertValidAnonKey(value: string) {
  const looksLikePublishable = value.startsWith("sb_publishable_");
  const looksLikeJwt = value.startsWith("eyJ");

  if (!looksLikePublishable && !looksLikeJwt) {
    throw new Error(
      "Invalid NEXT_PUBLIC_SUPABASE_ANON_KEY format. Expected a Supabase publishable key or anon JWT.",
    );
  }
}

export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL in .env.local.");
  }

  if (!anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.");
  }

  assertValidUrl(url);
  assertValidAnonKey(anonKey);

  return {
    url,
    anonKey,
  };
}
