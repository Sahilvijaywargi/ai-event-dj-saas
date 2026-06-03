"use client";

import { useState } from "react";
import { AiSystemHealthPanel } from "@/app/dashboard/AiSystemHealthPanel";
import { AiSpotifyRecommendationsPanel } from "@/app/dashboard/AiSpotifyRecommendationsPanel";
import { SpotifyIntegrationPanel } from "@/app/dashboard/SpotifyIntegrationPanel";
import { EventsSection } from "@/app/dashboard/EventsSection";
import { AiEventPlanSection } from "@/app/dashboard/AiEventPlanSection";
import { QueueIntelligenceSection } from "@/app/dashboard/QueueIntelligenceSection";
import { LiveSessionPanel } from "@/app/dashboard/LiveSessionPanel";
import { PlaybackSafetyAuditPanel } from "@/app/dashboard/PlaybackSafetyAuditPanel";
import { AuditRetentionPanel } from "@/app/dashboard/AuditRetentionPanel";
import { TransitionEnginePanel } from "@/app/dashboard/TransitionEnginePanel";
import { AutonomousRuntimePanel } from "@/app/dashboard/AutonomousRuntimePanel";
import { CrowdIntelligencePanel } from "@/app/dashboard/CrowdIntelligencePanel";
import { AudioEnergyIntelligencePanel } from "@/app/dashboard/AudioEnergyIntelligencePanel";
import { RuntimeIntelligenceCoordinatorPanel } from "@/app/dashboard/RuntimeIntelligenceCoordinatorPanel";
import { AiExplainabilityPanel } from "@/app/dashboard/AiExplainabilityPanel";
import { RuntimeLearningIntelligencePanel } from "@/app/dashboard/RuntimeLearningIntelligencePanel";
import { LivePlaybackExecutionPanel } from "@/app/dashboard/LivePlaybackExecutionPanel";
import { QaReadinessPill } from "@/app/qa/QaReadinessPill";
import { QueueRecommendationWithMeta } from "@/lib/ai/queue-engine";
import { DjSessionRecord, SessionActivityRecord } from "@/lib/dj-session/types";
import { EventPlanView, EventRecord } from "@/lib/events/types";

type DashboardContentProps = {
  initialEvents: EventRecord[];
  initialPlans: EventPlanView[];
  initialQueueRecommendations: QueueRecommendationWithMeta[];
  initialSpotifyConnected: boolean;
  initialSpotifyAccountName: string | null;
  initialSpotifyPlaylists: Array<{ id: string; name: string; tracksCount: number }>;
  initialLiveSession: DjSessionRecord | null;
  initialSessionActivities: SessionActivityRecord[];
  initialProviderHealth: {
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
};

export function DashboardContent({
  initialEvents,
  initialPlans,
  initialQueueRecommendations,
  initialSpotifyConnected,
  initialSpotifyAccountName,
  initialSpotifyPlaylists,
  initialLiveSession,
  initialSessionActivities,
  initialProviderHealth,
}: DashboardContentProps) {
  const [plans, setPlans] = useState(initialPlans);
  const [queueRecommendations, setQueueRecommendations] = useState(
    initialQueueRecommendations,
  );

  async function refreshPlans() {
    const response = await fetch("/api/event-plans", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message ?? "Failed to refresh AI plans.");
    }
    setPlans(data.plans ?? []);
  }

  async function refreshQueueRecommendations() {
    const response = await fetch("/api/queue-intelligence", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message ?? "Failed to refresh queue intelligence.");
    }
    setQueueRecommendations(data.recommendations ?? []);
  }

  async function handleEventCreated() {
    await Promise.all([refreshPlans(), refreshQueueRecommendations()]);
  }

  async function refreshAiSpotifyRecommendations() {
    await fetch("/api/spotify/ai-recommendations/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forceRefresh: true }),
    });
  }

  return (
    <>
      <section className="glass-panel rounded-2xl p-4 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-purple-200">Internal QA</p>
            <p className="mt-1 text-sm text-white/70">Quick beta-event readiness visibility for operators and testers.</p>
          </div>
          <QaReadinessPill compact={false} />
        </div>
      </section>
      <AiSystemHealthPanel initialMetrics={initialProviderHealth} />
      <SpotifyIntegrationPanel
        initialConnected={initialSpotifyConnected}
        initialAccountName={initialSpotifyAccountName}
        initialPlaylists={initialSpotifyPlaylists}
      />
      <LiveSessionPanel
        events={initialEvents}
        queueRecommendations={queueRecommendations}
        onRequestRecommendationRefresh={refreshAiSpotifyRecommendations}
        initialSession={initialLiveSession}
        initialActivities={initialSessionActivities}
      />
      <EventsSection initialEvents={initialEvents} onEventCreated={handleEventCreated} />
      <AiEventPlanSection initialPlans={plans} />
      <QueueIntelligenceSection initialRecommendations={queueRecommendations} />
      <AiSpotifyRecommendationsPanel initialRecommendations={queueRecommendations} />
      <TransitionEnginePanel queueRecommendations={queueRecommendations} />
      <LivePlaybackExecutionPanel queueRecommendations={queueRecommendations} />
      <RuntimeIntelligenceCoordinatorPanel />
      <RuntimeLearningIntelligencePanel />
      <AiExplainabilityPanel />
      <AutonomousRuntimePanel />
      <CrowdIntelligencePanel />
      <AudioEnergyIntelligencePanel />
      <PlaybackSafetyAuditPanel />
      <AuditRetentionPanel />
    </>
  );
}
