"use client";

import { useEffect, useRef, useState } from "react";

type LoopState = {
  status: "stopped" | "running";
  intervalMs: number;
  lastEvaluationAt: string | null;
  pendingTransition: string | null;
  supervisionMode: "manual_override" | "assisted_autonomous";
  safetyStatus: {
    safeToExecute: boolean;
    reasons: string[];
  };
  tickHistory: Array<{
    tickAt: string;
    decision: string;
    confidence: number;
    riskLevel: string;
    executed: boolean;
    message: string;
  }>;
};

export function AutonomousRuntimePanel() {
  const [state, setState] = useState<LoopState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [intervalMs, setIntervalMs] = useState(15000);
  const [supervisionMode, setSupervisionMode] = useState<"manual_override" | "assisted_autonomous">(
    "manual_override",
  );
  const isRefreshingRef = useRef(false);
  const isMountedRef = useRef(true);

  async function refreshState() {
    if (isRefreshingRef.current) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

    isRefreshingRef.current = true;
    try {
      const response = await fetch("/api/autonomous-loop/state");
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Failed to load autonomous runtime state.");
      if (isMountedRef.current) {
        setState(data.state ?? null);
        if (data.state?.supervisionMode) {
          setSupervisionMode(data.state.supervisionMode);
        }
        if (typeof data.state?.intervalMs === "number") {
          setIntervalMs(data.state.intervalMs);
        }
      }
    } catch (error) {
      if (isMountedRef.current) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load autonomous runtime state.");
      }
    } finally {
      isRefreshingRef.current = false;
    }
  }

  async function startLoop() {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/autonomous-loop/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intervalMs, supervisionMode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Failed to start loop.");
      setState(data.state ?? null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to start loop.");
    } finally {
      setIsLoading(false);
    }
  }

  async function stopLoop() {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/autonomous-loop/stop", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Failed to stop loop.");
      setState(data.state ?? null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to stop loop.");
    } finally {
      setIsLoading(false);
    }
  }

  async function tickLoop(executeIfSafe: boolean) {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/autonomous-loop/tick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ executeIfSafe, supervisionMode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Failed to run loop tick.");
      setState(data.state ?? null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to run loop tick.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    isMountedRef.current = true;
    const timer = setTimeout(() => {
      void refreshState();
    }, 0);
    const polling = setInterval(() => {
      void refreshState();
    }, 30000);
    return () => {
      isMountedRef.current = false;
      clearTimeout(timer);
      clearInterval(polling);
    };
  }, []);

  return (
    <article id="autonomous-runtime" className="glass-panel animate-fade-up rounded-2xl p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold md:text-2xl">Autonomous Runtime</h2>
          <p className="mt-1 text-sm text-white/65">
            Continuous supervised orchestration loop with interruptible and guardrail-aware runtime.
          </p>
        </div>
        <button
          onClick={refreshState}
          className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-white/10"
        >
          Sync
        </button>
      </div>

      {errorMessage ? (
        <p className="mb-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Loop Status</p>
          <p className="mt-1 font-semibold">{state?.status ?? "stopped"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Tick Frequency</p>
          <p className="mt-1 font-semibold">{Math.round((state?.intervalMs ?? intervalMs) / 1000)}s</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Safety</p>
          <p className="mt-1 font-semibold">{state?.safetyStatus?.safeToExecute ? "safe" : "blocked"}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <select
          value={supervisionMode}
          onChange={(event) =>
            setSupervisionMode(event.target.value as "manual_override" | "assisted_autonomous")
          }
          className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm"
        >
          <option value="manual_override">Manual Override</option>
          <option value="assisted_autonomous">Assisted Autonomous</option>
        </select>
        <select
          value={intervalMs}
          onChange={(event) => setIntervalMs(Math.max(4000, Math.min(120000, Number(event.target.value))))}
          className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm"
        >
          <option value={6000}>6s</option>
          <option value={10000}>10s</option>
          <option value={15000}>15s</option>
          <option value={30000}>30s</option>
          <option value={60000}>60s</option>
        </select>
        <button
          onClick={startLoop}
          disabled={isLoading}
          className="rounded-full border border-purple-300/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-purple-100 hover:bg-purple-500/10 disabled:opacity-60"
        >
          Start Loop
        </button>
        <button
          onClick={stopLoop}
          disabled={isLoading}
          className="rounded-full border border-red-300/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-red-200 hover:bg-red-500/10 disabled:opacity-60"
        >
          Stop Loop
        </button>
        <button
          onClick={() => tickLoop(false)}
          disabled={isLoading}
          className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-white/10 disabled:opacity-60"
        >
          Tick (Review)
        </button>
        <button
          onClick={() => tickLoop(true)}
          disabled={isLoading || supervisionMode !== "assisted_autonomous"}
          className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-white/10 disabled:opacity-60"
        >
          Tick (Execute Safe)
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Runtime Summary</p>
          <p className="mt-1">Last evaluation: {state?.lastEvaluationAt ? new Date(state.lastEvaluationAt).toLocaleTimeString() : "N/A"}</p>
          <p>Pending transition: {state?.pendingTransition ?? "none"}</p>
          <p>Supervision mode: {state?.supervisionMode ?? supervisionMode}</p>
          {state?.safetyStatus?.reasons?.length ? (
            <p className="mt-1 text-amber-200">Safety notes: {state.safetyStatus.reasons.join(" | ")}</p>
          ) : null}
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Loop Execution History</p>
          <div className="mt-2 space-y-1 text-xs">
            {(state?.tickHistory ?? []).slice(0, 6).map((tick, index) => (
              <div key={`${tick.tickAt}-${index}`} className="rounded-lg border border-white/10 bg-black/25 p-2">
                <p>
                {new Date(tick.tickAt)
  .toISOString()
  .slice(11, 16)} - {tick.decision} ({tick.confidence}% / {tick.riskLevel})
                </p>
                <p className="text-white/70">{tick.message}</p>
              </div>
            ))}
            {(state?.tickHistory ?? []).length === 0 ? (
              <p className="text-white/60">No loop ticks yet.</p>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

