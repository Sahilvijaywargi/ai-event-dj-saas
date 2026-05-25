import { NextResponse } from "next/server";
import { getDeploymentReadinessStatus } from "@/lib/runtime/deployment-readiness";

export async function GET() {
  try {
    const status = getDeploymentReadinessStatus();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      {
        ready: false,
        environment: process.env.NODE_ENV || "development",
        buildValidation: {
          buildCompatible: false,
          runtimeCompatible: false,
          hydrationSafe: false,
          envReady: false,
          ssrSafe: false,
        },
        issues: [
          {
            code: "runtime_api_unavailable",
            severity: "error",
            message: error instanceof Error ? error.message : "Deployment readiness check failed.",
            area: "runtime",
          },
        ],
        diagnostics: {
          nodeVersion: process.version,
          hasFetch: typeof fetch === "function",
          hasAbortController: typeof AbortController !== "undefined",
          edgeRuntimeHint: "unknown",
          nextRuntime: process.env.NEXT_RUNTIME || "nodejs",
          browserGuardActive: true,
          dynamicImportGuardActive: true,
        },
        warnings: ["Deployment readiness endpoint fallback response."],
      },
      { status: 500 },
    );
  }
}

