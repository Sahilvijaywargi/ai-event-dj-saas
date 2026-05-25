import { NextResponse } from "next/server";
import { getProviderHealthMetrics } from "@/lib/ai/observability";

export async function GET() {
  const metrics = getProviderHealthMetrics();
  return NextResponse.json(metrics);
}

