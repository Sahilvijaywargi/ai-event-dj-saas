import { NextResponse } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import dns from "node:dns/promises";

export async function GET() {
  try {
    const { url, anonKey } = getSupabaseEnv();
    const hostname = new URL(url).hostname;

    let dnsResolved = false;
    let dnsError: string | null = null;
    try {
      await dns.lookup(hostname);
      dnsResolved = true;
    } catch (error) {
      dnsError = error instanceof Error ? error.message : "DNS lookup failed";
    }

    let authReachable = false;
    let authStatus: number | null = null;
    let authError: string | null = null;
    try {
      const response = await fetch(`${url}/auth/v1/settings`, {
        headers: {
          apikey: anonKey,
        },
        signal: AbortSignal.timeout(7000),
      });

      authStatus = response.status;
      authReachable = response.ok;
    } catch (error) {
      authError = error instanceof Error ? error.message : "Auth settings request failed";
    }

    return NextResponse.json({
      ok: dnsResolved && authReachable,
      envLoaded: true,
      url,
      host: hostname,
      keyPrefix: anonKey.slice(0, 16),
      keyType: anonKey.startsWith("sb_publishable_") ? "publishable" : "jwt",
      dnsResolved,
      dnsError,
      authReachable,
      authStatus,
      authError,
      message: authReachable
        ? "Supabase auth endpoint reachable"
        : "Supabase auth endpoint not reachable",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        envLoaded: false,
        authReachable: false,
        message: error instanceof Error ? error.message : "Unknown Supabase health error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
