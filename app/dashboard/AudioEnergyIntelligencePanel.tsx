"use client";

import { useEffect, useRef, useState } from "react";

type AudioState = {
  latest: {
    energy_level: number;
    crowd_intensity: number;
    silence_detected: boolean;
    spike_detected: boolean;
    drift_score: number;
  } | null;
  drift: {
    rollingAverage: number;
    shortTermAverage: number;
    driftScore: number;
    silenceDetected: boolean;
    spikeDetected: boolean;
  };
  engagement: {
    engagementScore: number;
    danceFloorActivityProxy: number;
    crowdNoiseIntensity: number;
  };
  rollingTrend: number[];
};

export function AudioEnergyIntelligencePanel() {
  const [state, setState] = useState<AudioState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isRefreshingRef = useRef(false);
  const isMountedRef = useRef(true);

  async function refreshState() {
    if (isRefreshingRef.current) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

    isRefreshingRef.current = true;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/audio-energy/state?limit=40");
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Failed to load audio energy intelligence.");
      if (isMountedRef.current) {
        setState(data.state ?? null);
      }
    } catch (error) {
      if (isMountedRef.current) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load audio energy intelligence.");
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
      isRefreshingRef.current = false;
    }
  }

  useEffect(() => {
    isMountedRef.current = true;
    const timer = setTimeout(() => {
      void refreshState();
    }, 0);
    const interval = setInterval(() => {
      void refreshState();
    }, 30000);
    return () => {
      isMountedRef.current = false;
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  return (
    <article id="audio-energy-intelligence" className="glass-panel animate-fade-up rounded-2xl p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold md:text-2xl">Audio Energy Intelligence</h2>
          <p className="mt-1 text-sm text-white/65">
            Lightweight environmental energy sensing without raw audio storage.
          </p>
        </div>
        <button
          onClick={refreshState}
          disabled={isLoading}
          className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-white/10 disabled:opacity-60"
        >
          {isLoading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {errorMessage ? (
        <p className="mb-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Live Room Energy</p>
          <p className="mt-1 font-semibold">{state?.latest?.energy_level?.toFixed(2) ?? "0.00"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Crowd Intensity</p>
          <p className="mt-1 font-semibold">{state?.latest?.crowd_intensity?.toFixed(2) ?? "0.00"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Silence Detection</p>
          <p className="mt-1 font-semibold">
            {state?.drift.silenceDetected ? "detected" : "none"}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Energy Drift</p>
          <p className="mt-1 font-semibold">{state?.drift.driftScore?.toFixed(2) ?? "0.00"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Engagement</p>
          <p className="mt-1 font-semibold">{state?.engagement.engagementScore?.toFixed(2) ?? "0.00"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Dance Proxy</p>
          <p className="mt-1 font-semibold">
            {state?.engagement.danceFloorActivityProxy?.toFixed(2) ?? "0.00"}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3">
        <p className="text-xs uppercase tracking-widest text-white/60">Rolling Energy Trend</p>
        <div className="mt-2 flex items-end gap-2">
          {(state?.rollingTrend ?? []).slice(0, 16).map((value, index) => (
            <div key={`audio-energy-${index}`} className="flex-1">
              <div
                className="rounded-t bg-gradient-to-t from-purple-500/70 to-purple-200/80"
                style={{ height: `${Math.max((value / 100) * 120, 12)}px` }}
              />
              <p className="mt-1 text-center text-[10px] text-white/65">{value.toFixed(0)}</p>
            </div>
          ))}
          {(state?.rollingTrend ?? []).length === 0 ? (
            <p className="text-sm text-white/60">No audio-energy samples yet.</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

