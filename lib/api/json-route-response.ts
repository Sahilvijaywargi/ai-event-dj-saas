import { NextResponse } from "next/server";

export type RouteAuthDiagnostics = {
  elapsedMs: number;
  hasAuthCookies: boolean;
  authErrorName: string | null;
  authErrorMessage: string | null;
  authErrorStatus: number | null;
};

export type ApiJsonErrorBody = {
  ok: false;
  success: false;
  error: string;
  message: string;
  retryable?: boolean;
  authFailureKind?: string;
  diagnostics?: RouteAuthDiagnostics;
};

export function apiJsonError(error: unknown, status = 500) {
  console.error("[API ERROR]", error);
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json(
    {
      ok: false,
      success: false,
      error: message,
      message,
    } satisfies ApiJsonErrorBody,
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

export function apiUnauthorized(message = "Unauthorized", diagnostics?: RouteAuthDiagnostics) {
  return NextResponse.json(
    {
      ok: false,
      success: false,
      error: "unauthorized",
      message,
      retryable: false,
      authFailureKind: "unauthenticated",
      diagnostics,
    } satisfies ApiJsonErrorBody,
    {
      status: 401,
      headers: { "Content-Type": "application/json" },
    },
  );
}

export function apiAuthServiceUnavailable(
  message = "Authentication service unavailable.",
  diagnostics?: RouteAuthDiagnostics,
) {
  return NextResponse.json(
    {
      ok: false,
      success: false,
      error: "auth_service_unavailable",
      message,
      retryable: true,
      authFailureKind: "auth_service_unavailable",
      diagnostics,
    } satisfies ApiJsonErrorBody,
    {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": "2",
      },
    },
  );
}

export function apiTransientAuthFailure(
  message = "Authentication validation temporarily failed.",
  diagnostics?: RouteAuthDiagnostics,
) {
  return NextResponse.json(
    {
      ok: false,
      success: false,
      error: "transient_auth_failure",
      message,
      retryable: true,
      authFailureKind: "transient_auth_failure",
      diagnostics,
    } satisfies ApiJsonErrorBody,
    {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": "1",
      },
    },
  );
}
