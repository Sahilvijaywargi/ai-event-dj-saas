import { NextResponse } from "next/server";
import {
  applyRuntimeReinforcementAction,
  RuntimeReinforcementAction,
} from "@/lib/ai/runtime-memory";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  patternId: string;
  actionType: RuntimeReinforcementAction;
  actionReason?: string;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.patternId || !body.actionType) {
    return NextResponse.json({ message: "patternId and actionType are required." }, { status: 400 });
  }

  try {
    const result = await applyRuntimeReinforcementAction({
      userId: user.id,
      patternId: body.patternId,
      actionType: body.actionType,
      actionReason: body.actionReason?.trim() || "Operator supervised action",
    });
    if (!result) {
      return NextResponse.json({ message: "Pattern not found." }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to apply reinforcement action." },
      { status: 500 },
    );
  }
}

