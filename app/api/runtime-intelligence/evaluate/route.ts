import { NextResponse } from "next/server";
import { evaluateRuntimeIntelligence } from "@/lib/ai/runtime-intelligence-coordinator";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  assistedAutonomousEnabled?: boolean;
  operatorInterrupt?: boolean;
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
    const state = await evaluateRuntimeIntelligence({
      userId: user.id,
      assistedAutonomousEnabled: body.assistedAutonomousEnabled ?? false,
      operatorInterrupt: body.operatorInterrupt ?? false,
    });
    return NextResponse.json({ state });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to evaluate runtime intelligence." },
      { status: 500 },
    );
  }
}

