"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  announceMiniSheetOpen,
  lockBodyScroll,
  subscribeMiniSheetOpen,
  unlockBodyScroll,
} from "@/app/ui/mini-sheet";

type QaPillApiResponse = {
  status: "ready" | "caution" | "blocked";
  readinessPercent: number;
  unresolvedIncidents: number;
  summary: {
    deploymentReadiness: boolean;
    runtimeReliability: string;
    recoveryValidation: string;
    performanceEfficiency: string;
    sessionPersistenceHealth: string;
    spotifyConnectivityReady: boolean;
  };
  generatedAt: string;
};

type QaReadinessPillProps = {
  className?: string;
  compact?: boolean;
};

const INITIAL: QaPillApiResponse = {
  status: "caution",
  readinessPercent: 0,
  unresolvedIncidents: 0,
  summary: {
    deploymentReadiness: false,
    runtimeReliability: "degraded",
    recoveryValidation: "idle",
    performanceEfficiency: "medium",
    sessionPersistenceHealth: "stale",
    spotifyConnectivityReady: false,
  },
  generatedAt: new Date().toISOString(),
};

export function QaReadinessPill({ className = "", compact = true }: QaReadinessPillProps) {
  const [payload, setPayload] = useState<QaPillApiResponse>(INITIAL);
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reopenGuardUntilRef = useRef(0);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/runtime/qa-readiness", { cache: "no-store" });
        const data = (await response.json()) as QaPillApiResponse;
        if (!active || !response.ok) return;
        setPayload(data);
      } catch {
        // quiet fallback for low visual noise
      }
    }

    void load();
    const interval = setInterval(
      () => {
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
        void load();
      },
      compact ? 18_000 : 14_000,
    );
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [compact]);

  const tone = useMemo(() => {
    if (payload.status === "ready") return "border-emerald-300/40 bg-emerald-500/10 text-emerald-100";
    if (payload.status === "blocked") return "border-red-300/40 bg-red-500/10 text-red-100";
    return "border-amber-300/40 bg-amber-500/10 text-amber-100";
  }, [payload.status]);

  const closeSheet = useCallback(() => {
    if (!expanded) return;
    reopenGuardUntilRef.current = Date.now() + 160;
    setClosing(true);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setExpanded(false);
      setClosing(false);
      closeTimerRef.current = null;
    }, 150);
  }, [expanded]);

  const toggleSheet = useCallback(() => {
    if (expanded) {
      closeSheet();
      return;
    }
    if (Date.now() < reopenGuardUntilRef.current) return;
    setExpanded(true);
    setClosing(false);
    announceMiniSheetOpen("qa-readiness-pill");
  }, [closeSheet, expanded]);

  useEffect(() => subscribeMiniSheetOpen("qa-readiness-pill", closeSheet), [closeSheet]);

  useEffect(() => {
    if (!expanded) return;
    lockBodyScroll();
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      closeSheet();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeSheet();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      unlockBodyScroll();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeSheet, expanded]);

  useEffect(() => {
    if (!expanded) return;
    const timer = setTimeout(() => panelRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [expanded]);

  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        onClick={toggleSheet}
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-wider transition hover:brightness-110 ${tone}`}
        aria-label="Open QA readiness summary"
        aria-expanded={expanded}
        aria-controls="qa-readiness-mini-sheet"
      >
        <span>QA {payload.status}</span>
        <span>{payload.readinessPercent}%</span>
        <span>Inc {payload.unresolvedIncidents}</span>
      </button>
      <a href="/qa" className="ml-2 inline-flex text-[11px] text-white/65 underline decoration-white/30 underline-offset-2">
        open
      </a>

      {expanded ? (
        <div
          ref={panelRef}
          id="qa-readiness-mini-sheet"
          role="dialog"
          aria-label="QA readiness summary"
          tabIndex={-1}
          className={`absolute right-0 z-40 mt-2 w-[min(88vw,320px)] rounded-xl border border-white/15 bg-[#0b0b10] p-3 text-xs text-white/80 shadow-2xl backdrop-blur-sm transition-all duration-150 ${
            closing ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"
          }`}
        >
          <p className="font-semibold text-white">QA Readiness Summary</p>
          <p className="mt-1 text-white/65">Operational visibility only.</p>
          <div className="mt-2 space-y-1.5">
            <Row label="Deployment" value={payload.summary.deploymentReadiness ? "ready" : "attention"} />
            <Row label="Runtime" value={payload.summary.runtimeReliability} />
            <Row label="Recovery" value={payload.summary.recoveryValidation} />
            <Row label="Performance" value={payload.summary.performanceEfficiency} />
            <Row label="Persistence" value={payload.summary.sessionPersistenceHealth} />
            <Row label="Spotify" value={payload.summary.spotifyConnectivityReady ? "ready" : "not ready"} />
          </div>
          <div className="mt-2 flex justify-end">
            <button
              onClick={closeSheet}
              className="mr-2 rounded-full border border-white/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider hover:bg-white/10"
            >
              Close
            </button>
            <a
              href="/qa"
              className="rounded-full border border-white/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider hover:bg-white/10"
            >
              Open QA Toolkit
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5">
      <span className="text-white/65">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  );
}

