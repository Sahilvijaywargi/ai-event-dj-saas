import { NextResponse } from "next/server";
import {
  RuntimeLearningSignal,
  RuntimeMemoryPatternType,
  storeRuntimeMemoryPattern,
} from "@/lib/ai/runtime-memory";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  patternType: RuntimeMemoryPatternType;
  patternContext: string;
  successScore: number;
  confidenceScore: number;
  learnedSignals?: RuntimeLearningSignal[];
  reinforce?: boolean;
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

  if (!body.patternType || !body.patternContext) {
    return NextResponse.json(
      { message: "patternType and patternContext are required." },
      { status: 400 },
    );
  }

  try {
    const pattern = await storeRuntimeMemoryPattern({
      userId: user.id,
      patternType: body.patternType,
      patternContext: body.patternContext,
      successScore: body.successScore ?? 0,
      confidenceScore: body.confidenceScore ?? 0,
      learnedSignals: body.learnedSignals ?? [],
      reinforce: body.reinforce ?? false,
    });
    return NextResponse.json({ pattern });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to store runtime memory pattern." },
      { status: 500 },
    );
  }
}

