import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  createOperatorUnlockSession,
  getOperatorLockCookieName,
  validateOperatorUnlockPin,
} from "@/lib/operator/operator-lock";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  pin?: string;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }

  if (!body.pin || !validateOperatorUnlockPin(body.pin)) {
    return NextResponse.json({ message: "Invalid PIN." }, { status: 403 });
  }

  const session = createOperatorUnlockSession(user.id);
  const cookieStore = await cookies();
  cookieStore.set(getOperatorLockCookieName(), session.sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor((session.expiresAt - Date.now()) / 1000),
  });

  return NextResponse.json({
    locked: false,
    expiresAt: new Date(session.expiresAt).toISOString(),
    remainingSeconds: Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000)),
  });
}

