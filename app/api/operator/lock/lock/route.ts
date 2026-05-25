import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getOperatorLockCookieName, lockOperatorSession } from "@/lib/operator/operator-lock";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  lockOperatorSession(user.id);
  const cookieStore = await cookies();
  cookieStore.delete(getOperatorLockCookieName());
  return NextResponse.json({ locked: true, expiresAt: null, remainingSeconds: 0 });
}

