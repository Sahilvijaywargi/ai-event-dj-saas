import { NextResponse } from "next/server";
import { rollbackQueueMutation } from "@/lib/spotify/playback-execution-engine";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const result = await rollbackQueueMutation(user.id);
  return NextResponse.json({
    ok: result.ok,
    state: result.state,
    message: result.message,
    observability: {
      lifecycleState: result.state.observabilitySurface?.lifecycleState ?? "pending",
      verificationScore: result.state.observabilitySurface?.verificationScore ?? 0,
      rollbackConfidence: result.state.observabilitySurface?.rollbackConfidence ?? 0,
      heartbeatHealth: result.state.observabilitySurface?.heartbeatHealth ?? 0,
      graceState: result.state.observabilitySurface?.graceState ?? "inactive",
      degradationSeverity: result.state.observabilitySurface?.degradationSeverity ?? "none",
      executionHealthClassification: result.state.observabilitySurface?.executionHealthClassification ?? "stabilizing",
      latestAuditCount: result.state.observabilitySurface?.latestAuditCount ?? 0,
    },
    diagnostics: {
      executionHealthClassification: result.state.executionHealthClassification,
      degradationSeverity: result.state.degradationSeverity,
      executionStabilityScore: result.state.executionStabilityScore,
      transportIntegrityScore: result.state.transportIntegrityScore,
      mutationRecoverabilityScore: result.state.mutationRecoverabilityScore,
      rollbackAllowed: result.state.rollbackAllowed,
      rollbackConfidence: result.state.rollbackConfidence,
      rollbackBlockers: result.state.rollbackBlockers ?? [],
      lifecycleState: result.state.mutationLifecycle?.state ?? "pending",
      latestAuditCount: result.state.mutationAuditTrail?.length ?? 0,
    },
  });
}
