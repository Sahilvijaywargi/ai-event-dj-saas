import { getClientEnv } from "@/lib/env/client";

export function getSupabaseEnv() {
  const env = getClientEnv();

  return {
    url: env.supabaseUrl,
    anonKey: env.supabaseAnonKey,
  };
}
