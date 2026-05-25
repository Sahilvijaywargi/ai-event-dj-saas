import { NextResponse } from "next/server";
import { restoreSessionRecovery } from "@/lib/runtime/session-recovery";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  try {
    const result = restoreSessionRecovery(user.id);
    if (!result.ok) {
      return NextResponse.json(
        { message: result.message, state: result.state },
        { status: 409 },
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to restore recovery state." },
      { status: 500 },
    );
  }
}

