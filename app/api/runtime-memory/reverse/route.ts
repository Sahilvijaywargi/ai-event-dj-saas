import { NextResponse } from "next/server";
import { reverseRuntimeMemoryAction } from "@/lib/ai/runtime-memory";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  patternId?: string;
  reversalReason?: string;
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

  try {
    const result = await reverseRuntimeMemoryAction({
      userId: user.id,
      patternId: body.patternId,
      reversalReason: body.reversalReason?.trim() || "Operator requested safe reversal",
    });
    if (!result.ok) return NextResponse.json({ message: result.message }, { status: 409 });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to reverse supervised action." },
      { status: 500 },
    );
  }
}

