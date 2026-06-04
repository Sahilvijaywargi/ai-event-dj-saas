import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import {
  apiAuthServiceUnavailable,
  apiTransientAuthFailure,
  apiUnauthorized,
  type RouteAuthDiagnostics,
} from "@/lib/api/json-route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type RouteAuthFailureKind =
  | "unauthenticated"
  | "auth_service_unavailable"
  | "transient_auth_failure";

function readAuthErrorMeta(error: unknown) {
  if (!error || typeof error !== "object") {
    return { name: null, message: error ? String(error) : null, status: null, code: null };
  }
  const record = error as { name?: string; message?: string; status?: number; code?: string };
  return {
    name: record.name ?? null,
    message: record.message ?? null,
    status: typeof record.status === "number" ? record.status : null,
    code: record.code ?? null,
  };
}

function hasSupabaseAuthCookies(cookieNames: string[]) {
  return cookieNames.some(
    (name) => name.includes("auth-token") || (name.startsWith("sb-") && name.includes("auth")),
  );
}

function isNetworkOrTimeoutFailure(error: unknown) {
  const { name, message, code } = readAuthErrorMeta(error);
  if (!message && !name && !code) return false;
  return (
    name === "AuthRetryableFetchError" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    /fetch failed|timeout|timed out|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|network|Connect Timeout/i.test(
      message ?? "",
    )
  );
}

function isTransientAuthFailure(error: unknown) {
  const { name, message, status } = readAuthErrorMeta(error);
  if (status === 429 || status === 502 || status === 503 || status === 504) return true;
  return /rate limit|temporarily unavailable|overloaded|try again/i.test(message ?? name ?? "");
}

function isExplicitUnauthenticated(error: unknown, hasAuthCookies: boolean) {
  if (!hasAuthCookies) return true;
  const { name, message } = readAuthErrorMeta(error);
  return (
    name === "AuthSessionMissingError" ||
    /session missing|auth session missing|invalid refresh token|refresh token not found|user not authenticated/i.test(
      message ?? "",
    )
  );
}

export async function resolveApiRouteAuth(): Promise<
  | { ok: true; user: User; diagnostics: RouteAuthDiagnostics }
  | { ok: false; kind: RouteAuthFailureKind; response: NextResponse; diagnostics: RouteAuthDiagnostics }
> {
  const started = Date.now();
  const cookieStore = await cookies();
  const authCookiePresent = hasSupabaseAuthCookies(cookieStore.getAll().map((entry) => entry.name));

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  const diagnostics: RouteAuthDiagnostics = {
    elapsedMs: Date.now() - started,
    hasAuthCookies: authCookiePresent,
    authErrorName: readAuthErrorMeta(error).name,
    authErrorMessage: readAuthErrorMeta(error).message,
    authErrorStatus: readAuthErrorMeta(error).status,
  };

  if (user) {
    return { ok: true, user, diagnostics };
  }

  if (error && isNetworkOrTimeoutFailure(error)) {
    console.error("[API AUTH] Supabase auth service unreachable", diagnostics);
    return {
      ok: false,
      kind: "auth_service_unavailable",
      response: apiAuthServiceUnavailable(
        "Authentication service is temporarily unreachable. Retry shortly.",
        diagnostics,
      ),
      diagnostics,
    };
  }

  if (error && isTransientAuthFailure(error)) {
    console.warn("[API AUTH] transient auth validation failure", diagnostics);
    return {
      ok: false,
      kind: "transient_auth_failure",
      response: apiTransientAuthFailure(
        "Authentication validation is temporarily unavailable. Retry shortly.",
        diagnostics,
      ),
      diagnostics,
    };
  }

  if (isExplicitUnauthenticated(error, authCookiePresent)) {
    return {
      ok: false,
      kind: "unauthenticated",
      response: apiUnauthorized("Unauthorized", diagnostics),
      diagnostics,
    };
  }

  if (authCookiePresent && error) {
    console.warn("[API AUTH] auth cookies present but validation failed", diagnostics);
    return {
      ok: false,
      kind: "transient_auth_failure",
      response: apiTransientAuthFailure(
        error instanceof Error ? error.message : "Authentication validation failed.",
        diagnostics,
      ),
      diagnostics,
    };
  }

  if (authCookiePresent) {
    console.warn("[API AUTH] auth cookies present but no user returned", diagnostics);
    return {
      ok: false,
      kind: "transient_auth_failure",
      response: apiTransientAuthFailure(
        "Authentication validation returned no user. Retry shortly.",
        diagnostics,
      ),
      diagnostics,
    };
  }

  return {
    ok: false,
    kind: "unauthenticated",
    response: apiUnauthorized("Unauthorized", diagnostics),
    diagnostics,
  };
}
