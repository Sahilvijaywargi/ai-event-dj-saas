import { NextResponse } from "next/server";

export type ApiJsonErrorBody = {
  ok: false;
  success: false;
  error: string;
  message: string;
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

export function apiUnauthorized(message = "Unauthorized") {
  return NextResponse.json(
    {
      ok: false,
      success: false,
      error: "unauthorized",
      message,
    } satisfies ApiJsonErrorBody,
    {
      status: 401,
      headers: { "Content-Type": "application/json" },
    },
  );
}
