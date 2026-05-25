import { NextResponse } from "next/server";
import {
  evaluateRuntimePerformanceState,
  getAdaptivePollingOptimization,
  getNetworkEfficiencyMetrics,
} from "@/lib/runtime/performance";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  // Server-side baseline metrics; client should merge with visibility/network hints.
  const polling = getAdaptivePollingOptimization({
    visible: true,
    online: true,
    saveData: false,
    effectiveType: "4g",
    baseIntervalMs: 6500,
  });
  const network = getNetworkEfficiencyMetrics({
    online: true,
    effectiveType: "4g",
    saveData: false,
    failureCount: 0,
    requestCount: 1,
  });
  const state = evaluateRuntimePerformanceState({
    polling,
    network,
    renderCountEstimate: 10,
  });
  return NextResponse.json({ state });
}

