"use client";

import { useState } from "react";

type ProviderHealthMetrics = {
  providerMode: "mock" | "openrouter";
  activeProvider: string;
  fallbackHitCount: number;
  timeoutCount: number;
  retryCount: number;
  averageResponseTimeMs: number;
  lastSuccessfulAiGeneration: string | null;
  lastFallbackReason: string | null;
  totalAiGenerations: number;
  successfulAiGenerations: number;
  failedAiGenerations: number;
  fallbackRate: number;
  aiOnline: boolean;
};

type AiSystemHealthPanelProps = {
  initialMetrics: ProviderHealthMetrics;
};

export function AiSystemHealthPanel({ initialMetrics }: AiSystemHealthPanelProps) {
  const [metrics, setMetrics] = useState(initialMetrics);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function refreshHealth() {
    setIsRefreshing(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/ai/provider-health", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await response.json()) as ProviderHealthMetrics;
      if (!response.ok) {
        throw new Error("Failed to refresh AI system health.");
      }
      setMetrics(data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to refresh AI health.");
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <article className="glass-panel animate-fade-up rounded-2xl p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold md:text-xl">AI System Health</h2>
          <p className="mt-1 text-sm text-white/65">
            Internal provider analytics and fallback safety indicators.
          </p>
        </div>
        <button
          onClick={refreshHealth}
          disabled={isRefreshing}
          className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider transition hover:border-white/40 hover:bg-white/10 disabled:opacity-60"
        >
          {isRefreshing ? "Refreshing..." : "Refresh Health"}
        </button>
      </div>

      {errorMessage ? (
        <p className="mb-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">
          {errorMessage}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Active Provider</p>
          <p className="mt-1 text-sm font-semibold">{metrics.activeProvider}</p>
          <p className="text-xs text-white/60">Mode: {metrics.providerMode}</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">AI Status</p>
          <p className={`mt-1 text-sm font-semibold ${metrics.aiOnline ? "text-green-300" : "text-amber-200"}`}>
            {metrics.aiOnline ? "Online" : "Fallback only"}
          </p>
          <p className="text-xs text-white/60">
            Last success:{" "}
            {metrics.lastSuccessfulAiGeneration
              ? new Date(metrics.lastSuccessfulAiGeneration).toLocaleString()
              : "Never"}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Fallback Rate</p>
          <p className="mt-1 text-sm font-semibold text-purple-200">{metrics.fallbackRate}%</p>
          <p className="text-xs text-white/60">Hits: {metrics.fallbackHitCount}</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Average Latency</p>
          <p className="mt-1 text-sm font-semibold">{metrics.averageResponseTimeMs} ms</p>
          <p className="text-xs text-white/60">Retries: {metrics.retryCount}</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">AI Generations</p>
          <p className="mt-1 text-sm font-semibold">{metrics.totalAiGenerations}</p>
          <p className="text-xs text-white/60">
            Success: {metrics.successfulAiGenerations} | Failed: {metrics.failedAiGenerations}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Timeout Events</p>
          <p className="mt-1 text-sm font-semibold">{metrics.timeoutCount}</p>
          <p className="text-xs text-white/60">
            Last fallback: {metrics.lastFallbackReason ?? "None"}
          </p>
        </div>
      </div>
    </article>
  );
}

