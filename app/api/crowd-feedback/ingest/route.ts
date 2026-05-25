import { NextResponse } from "next/server";
import {
  CrowdFeedbackSource,
  CrowdFeedbackType,
  ingestCrowdFeedback,
} from "@/lib/ai/crowd-feedback";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  sessionId?: string | null;
  feedbackType?: CrowdFeedbackType;
  feedbackSource?: CrowdFeedbackSource;
  feedbackPayload?: Record<string, unknown>;
  energyImpact?: number;
  confidenceImpact?: number;
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
  if (!body.feedbackType || !body.feedbackSource) {
    return NextResponse.json(
      { message: "feedbackType and feedbackSource are required." },
      { status: 400 },
    );
  }

  try {
    const event = await ingestCrowdFeedback({
      userId: user.id,
      sessionId: body.sessionId,
      feedbackType: body.feedbackType,
      feedbackSource: body.feedbackSource,
      feedbackPayload: body.feedbackPayload,
      energyImpact: body.energyImpact,
      confidenceImpact: body.confidenceImpact,
    });
    return NextResponse.json({ event });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to ingest crowd feedback." },
      { status: 500 },
    );
  }
}

