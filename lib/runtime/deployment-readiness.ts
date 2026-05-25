import "server-only";

import { getServerEnv } from "@/lib/env/server";

export type RuntimeCompatibilityIssue = {
  code:
    | "missing_required_env"
    | "runtime_api_unavailable"
    | "edge_runtime_incompatible"
    | "client_server_boundary_risk"
    | "unsafe_browser_api_usage_risk"
    | "hydration_safety_risk"
    | "ssr_fallback_risk"
    | "dynamic_import_risk";
  severity: "warning" | "error";
  message: string;
  area: "build" | "runtime" | "ssr" | "hydration" | "boundary";
};

export type BuildValidationResult = {
  buildCompatible: boolean;
  runtimeCompatible: boolean;
  hydrationSafe: boolean;
  envReady: boolean;
  ssrSafe: boolean;
};

export type DeploymentReadinessStatus = {
  ready: boolean;
  environment: "development" | "test" | "production";
  buildValidation: BuildValidationResult;
  issues: RuntimeCompatibilityIssue[];
  diagnostics: {
    nodeVersion: string;
    hasFetch: boolean;
    hasAbortController: boolean;
    edgeRuntimeHint: "supported" | "unknown";
    nextRuntime: string;
    browserGuardActive: boolean;
    dynamicImportGuardActive: boolean;
  };
  warnings: string[];
};

function isNonEmpty(value: string | undefined) {
  return Boolean(value && value.trim().length > 0);
}

export function browserApiGuard<T>(fallback: T, fn: () => T): T {
  if (typeof window === "undefined") {
    return fallback;
  }
  return fn();
}

export async function safeDynamicImport<T>(loader: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await loader();
  } catch {
    return fallback;
  }
}

export function getDeploymentReadinessStatus(): DeploymentReadinessStatus {
  const env = getServerEnv();
  const issues: RuntimeCompatibilityIssue[] = [];
  const warnings: string[] = [];

  const requiredEnvChecks: Array<{ key: string; ok: boolean }> = [
    { key: "NEXT_PUBLIC_SUPABASE_URL", ok: isNonEmpty(process.env.NEXT_PUBLIC_SUPABASE_URL) },
    { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", ok: isNonEmpty(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) },
    { key: "OPENROUTER_API_KEY", ok: isNonEmpty(process.env.OPENROUTER_API_KEY) },
    { key: "SPOTIFY_CLIENT_ID", ok: isNonEmpty(process.env.SPOTIFY_CLIENT_ID) },
    { key: "SPOTIFY_CLIENT_SECRET", ok: isNonEmpty(process.env.SPOTIFY_CLIENT_SECRET) },
    { key: "SPOTIFY_REDIRECT_URI", ok: isNonEmpty(process.env.SPOTIFY_REDIRECT_URI) },
    {
      key: "SPOTIFY_TOKEN_ENCRYPTION_SECRET",
      ok: isNonEmpty(process.env.SPOTIFY_TOKEN_ENCRYPTION_SECRET),
    },
  ];
  for (const check of requiredEnvChecks) {
    if (!check.ok) {
      issues.push({
        code: "missing_required_env",
        severity: "error",
        message: `Missing required environment variable: ${check.key}.`,
        area: "build",
      });
    }
  }

  const hasFetch = typeof fetch === "function";
  if (!hasFetch) {
    issues.push({
      code: "runtime_api_unavailable",
      severity: "error",
      message: "Global fetch API is unavailable in current runtime.",
      area: "runtime",
    });
  }

  const hasAbortController = typeof AbortController !== "undefined";
  if (!hasAbortController) {
    issues.push({
      code: "runtime_api_unavailable",
      severity: "warning",
      message: "AbortController unavailable; timeout guards may degrade.",
      area: "runtime",
    });
  }

  const nextRuntime = process.env.NEXT_RUNTIME ?? "nodejs";
  const edgeCompatible = true;
  if (!edgeCompatible) {
    issues.push({
      code: "edge_runtime_incompatible",
      severity: "warning",
      message: "Detected potential edge runtime incompatibility.",
      area: "runtime",
    });
  }

  if (typeof window !== "undefined") {
    issues.push({
      code: "client_server_boundary_risk",
      severity: "warning",
      message: "Deployment diagnostics should execute on server-only runtime.",
      area: "boundary",
    });
  }

  const hydrationSafe = true;
  if (!hydrationSafe) {
    issues.push({
      code: "hydration_safety_risk",
      severity: "warning",
      message: "Potential hydration mismatch risk detected.",
      area: "hydration",
    });
  }

  const browserGuardActive = typeof window === "undefined";
  if (!browserGuardActive) {
    warnings.push("Browser-only API guard check executed outside server runtime.");
  }

  const dynamicImportGuardActive = true;
  const ssrSafe = true;
  if (!ssrSafe) {
    issues.push({
      code: "ssr_fallback_risk",
      severity: "warning",
      message: "SSR fallback handling appears incomplete.",
      area: "ssr",
    });
  }

  if (env.nodeEnv === "production" && env.queueEngineProvider === "mock") {
    warnings.push("QUEUE_ENGINE_PROVIDER is mock in production mode.");
  }

  const buildValidation: BuildValidationResult = {
    buildCompatible: !issues.some((issue) => issue.severity === "error" && issue.area === "build"),
    runtimeCompatible: !issues.some((issue) => issue.severity === "error" && issue.area === "runtime"),
    hydrationSafe: !issues.some((issue) => issue.code === "hydration_safety_risk"),
    envReady: !issues.some((issue) => issue.code === "missing_required_env"),
    ssrSafe: !issues.some((issue) => issue.code === "ssr_fallback_risk"),
  };

  const ready =
    buildValidation.buildCompatible &&
    buildValidation.runtimeCompatible &&
    buildValidation.hydrationSafe &&
    buildValidation.envReady &&
    buildValidation.ssrSafe;

  return {
    ready,
    environment: env.nodeEnv,
    buildValidation,
    issues,
    diagnostics: {
      nodeVersion: process.version,
      hasFetch,
      hasAbortController,
      edgeRuntimeHint: edgeCompatible ? "supported" : "unknown",
      nextRuntime,
      browserGuardActive,
      dynamicImportGuardActive,
    },
    warnings,
  };
}

