import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getOperatorLockCookieName, getOperatorLockState } from "@/lib/operator/operator-lock";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(getOperatorLockCookieName())?.value ?? null;
  const state = getOperatorLockState(user.id, sessionCookie);
  return NextResponse.json(state);
}

