import { redirect } from "next/navigation";
import {
  MockQueueEngineProvider,
  QueueRecommendationWithMeta,
} from "@/lib/ai/queue-engine";
import { getProviderHealthMetrics } from "@/lib/ai/observability";
import {
  getSpotifyConnectionStatus,
  getSpotifyPlaylists,
} from "@/lib/spotify/service";
import { LogoutButton } from "@/app/dashboard/LogoutButton";
import { DashboardContent } from "@/app/dashboard/DashboardContent";
import { DjSessionRecord, SessionActivityRecord } from "@/lib/dj-session/types";
import { EventPlanView, EventRecord } from "@/lib/events/types";
import { normalizeRelation } from "@/lib/supabase/relations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: eventsData, error: eventsError } = await supabase
    .from("events")
    .select(
      "id,event_name,event_type,event_date,start_time,end_time,crowd_size,genres,energy_level,created_at",
    )
    .eq("user_id", user.id)
    .order("event_date", { ascending: true })
    .order("start_time", { ascending: true });

  const initialEvents = (eventsData ?? []) as EventRecord[];
  const { data: plansData, error: plansError } = await supabase
    .from("event_plans")
    .select(
      "id,event_id,user_id,timeline,energy_progression,recommended_genres,starter_playlist,created_at,events!inner(event_name,event_type,event_date,start_time,end_time,crowd_size)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const initialPlans: EventPlanView[] =
    plansData?.map((row) => {
      const relatedEvent = normalizeRelation(row.events);

      return {
        id: row.id,
        eventId: row.event_id,
        eventName: relatedEvent?.event_name ?? "",
        eventType: relatedEvent?.event_type ?? "",
        eventDate: relatedEvent?.event_date ?? "",
        startTime: relatedEvent?.start_time ?? "",
        endTime: relatedEvent?.end_time ?? "",
        crowdSize: relatedEvent?.crowd_size ?? 0,
        timeline: row.timeline,
        energyProgression: row.energy_progression,
        recommendedGenres: row.recommended_genres,
        starterPlaylist: row.starter_playlist,
        createdAt: row.created_at,
      };
    }) ?? [];

  const queueProvider = new MockQueueEngineProvider();
  const initialProviderHealth = getProviderHealthMetrics();
  const { data: snapshotRows, error: snapshotsError } = await supabase
    .from("queue_snapshots")
    .select("id,event_plan_id,created_at,queue_data")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const snapshotMetaByPlan = new Map<
    string,
    {
      latestSnapshotId: string;
      latestGeneratedAt: string;
      queueData: QueueRecommendationWithMeta;
      count: number;
    }
  >();

  for (const snapshot of snapshotRows ?? []) {
    const existing = snapshotMetaByPlan.get(snapshot.event_plan_id);
    if (existing) {
      snapshotMetaByPlan.set(snapshot.event_plan_id, {
        ...existing,
        count: existing.count + 1,
      });
      continue;
    }

    snapshotMetaByPlan.set(snapshot.event_plan_id, {
      latestSnapshotId: snapshot.id,
      latestGeneratedAt: snapshot.created_at,
      queueData: snapshot.queue_data as QueueRecommendationWithMeta,
      count: 1,
    });
  }

  const initialQueueRecommendations: QueueRecommendationWithMeta[] = await Promise.all(
    initialPlans.map(async (plan) => {
      const snapshotMeta = snapshotMetaByPlan.get(plan.id);
      const generated = await queueProvider.generateFromPlan(plan);

      return {
        ...(snapshotMeta?.queueData ?? generated),
        latestSnapshotId: snapshotMeta?.latestSnapshotId ?? null,
        latestGeneratedAt: snapshotMeta?.latestGeneratedAt ?? null,
        queueVersionCount: snapshotMeta?.count ?? 0,
      };
    }),
  );

  const { data: liveSessionData, error: liveSessionError } = await supabase
    .from("dj_sessions")
    .select("*")
    .eq("user_id", user.id)
    .in("session_status", ["live", "paused"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: sessionActivitiesData, error: sessionActivitiesError } = liveSessionData
    ? await supabase
        .from("session_activity")
        .select("*")
        .eq("session_id", liveSessionData.id)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: [], error: null };

  const initialLiveSession = (liveSessionData ?? null) as DjSessionRecord | null;
  const initialSessionActivities = (sessionActivitiesData ?? []) as SessionActivityRecord[];

  let initialSpotifyConnected = false;
  let initialSpotifyAccountName: string | null = null;
  let initialSpotifyPlaylists: Array<{ id: string; name: string; tracksCount: number }> = [];
  let spotifyErrorMessage: string | null = null;

  try {
    const connection = await getSpotifyConnectionStatus(user.id);
    if (connection) {
      initialSpotifyConnected = true;
      initialSpotifyAccountName = connection.display_name;
      initialSpotifyPlaylists = await getSpotifyPlaylists(user.id);
    }
  } catch (error) {
    spotifyErrorMessage =
      error instanceof Error ? error.message : "Unable to initialize Spotify panel.";
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-lux-gradient bg-[length:200%_200%] animate-gradient-shift opacity-90" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(168,85,247,0.24),transparent_38%),radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.08),transparent_32%),radial-gradient(circle_at_50%_80%,rgba(147,51,234,0.2),transparent_40%)]" />

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 md:px-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="glass-panel animate-fade-up rounded-2xl p-4 md:p-5 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:overflow-y-auto">
          <div className="mb-6 border-b border-white/10 pb-5">
            <p className="text-xs uppercase tracking-[0.24em] text-purple-200">AI EVENT DJ</p>
            <h1 className="mt-2 text-2xl font-semibold">Dashboard</h1>
            <p className="mt-2 text-sm text-white/70">
              Signed in as <span className="text-white">{user.email}</span>
            </p>
          </div>

          <nav className="space-y-2">
            <a
              href="#events"
              className="block rounded-xl border border-purple-300/30 bg-purple-500/10 px-4 py-3 text-sm font-medium text-purple-100 transition hover:border-purple-200/50"
            >
              Events
            </a>
            <a
              href="#spotify"
              className="block rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/85 transition hover:border-white/25 hover:bg-white/10"
            >
              Spotify
            </a>
            <a
              href="#live-session"
              className="block rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/85 transition hover:border-white/25 hover:bg-white/10"
            >
              Live Session
            </a>
            <a
              href="#music-queue"
              className="block rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/85 transition hover:border-white/25 hover:bg-white/10"
            >
              Music Queue
            </a>
            <a
              href="#ai-queue-intelligence"
              className="block rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/85 transition hover:border-white/25 hover:bg-white/10"
            >
              AI Queue Intelligence
            </a>
            <a
              href="#ai-spotify-recommendations"
              className="block rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/85 transition hover:border-white/25 hover:bg-white/10"
            >
              AI Spotify Recs
            </a>
            <a
              href="#transition-engine"
              className="block rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/85 transition hover:border-white/25 hover:bg-white/10"
            >
              Transition Engine
            </a>
            <a
              href="#runtime-intelligence-coordinator"
              className="block rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/85 transition hover:border-white/25 hover:bg-white/10"
            >
              Runtime Coordinator
            </a>
            <a
              href="#runtime-learning-intelligence"
              className="block rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/85 transition hover:border-white/25 hover:bg-white/10"
            >
              Runtime Learning
            </a>
            <a
              href="#ai-explainability"
              className="block rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/85 transition hover:border-white/25 hover:bg-white/10"
            >
              AI Explainability
            </a>
            <a
              href="#autonomous-runtime"
              className="block rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/85 transition hover:border-white/25 hover:bg-white/10"
            >
              Autonomous Runtime
            </a>
            <a
              href="#crowd-intelligence"
              className="block rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/85 transition hover:border-white/25 hover:bg-white/10"
            >
              Crowd Intelligence
            </a>
            <a
              href="#audio-energy-intelligence"
              className="block rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/85 transition hover:border-white/25 hover:bg-white/10"
            >
              Audio Energy
            </a>
            <a
              href="#playback-safety-audit"
              className="block rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/85 transition hover:border-white/25 hover:bg-white/10"
            >
              Playback Safety
            </a>
            <a
              href="#audit-retention"
              className="block rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/85 transition hover:border-white/25 hover:bg-white/10"
            >
              Audit Retention
            </a>
            <a
              href="#ai-event-plan"
              className="block rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/85 transition hover:border-white/25 hover:bg-white/10"
            >
              AI Event Plan
            </a>
            <a
              href="#mood-engine"
              className="block rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/85 transition hover:border-white/25 hover:bg-white/10"
            >
              AI Mood Engine
            </a>
            <a
              href="#settings"
              className="block rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/85 transition hover:border-white/25 hover:bg-white/10"
            >
              Settings
            </a>
          </nav>

          <div className="mt-6 pt-5">
            <LogoutButton />
          </div>
        </aside>

        <section className="space-y-6">
          <DashboardContent
            initialEvents={initialEvents}
            initialPlans={initialPlans}
            initialQueueRecommendations={initialQueueRecommendations}
            initialSpotifyConnected={initialSpotifyConnected}
            initialSpotifyAccountName={initialSpotifyAccountName}
            initialSpotifyPlaylists={initialSpotifyPlaylists}
            initialLiveSession={initialLiveSession}
            initialSessionActivities={initialSessionActivities}
            initialProviderHealth={initialProviderHealth}
          />

          {eventsError ? (
            <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              Unable to load events right now: {eventsError.message}
            </p>
          ) : null}

          {plansError ? (
            <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              Unable to load AI plans right now: {plansError.message}
            </p>
          ) : null}

          {snapshotsError ? (
            <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              Unable to load queue snapshots right now: {snapshotsError.message}
            </p>
          ) : null}

          {liveSessionError ? (
            <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              Unable to load live session state: {liveSessionError.message}
            </p>
          ) : null}

          {sessionActivitiesError ? (
            <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              Unable to load session activities: {sessionActivitiesError.message}
            </p>
          ) : null}

          {spotifyErrorMessage ? (
            <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              Spotify integration warning: {spotifyErrorMessage}
            </p>
          ) : null}

          <article id="music-queue" className="glass-panel animate-fade-up rounded-2xl p-5 md:p-6">
            <h2 className="text-xl font-semibold md:text-2xl">Music Queue</h2>
            <p className="mt-2 text-sm text-white/70">
              Intelligent queue blending current crowd energy with your event profile.
            </p>
            <div className="mt-5 space-y-3">
              {[
                "Midnight City - Synthwave Edit",
                "Levitating - Disco Pulse Mix",
                "Sunset Boulevard - Deep House Intro",
              ].map((track, index) => (
                <div
                  key={track}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-3"
                >
                  <p className="text-sm text-white/90">
                    {index + 1}. {track}
                  </p>
                  <span className="text-xs uppercase tracking-widest text-purple-200">
                    queued
                  </span>
                </div>
              ))}
            </div>
          </article>

          <article id="mood-engine" className="glass-panel animate-fade-up rounded-2xl p-5 md:p-6">
            <h2 className="text-xl font-semibold md:text-2xl">AI Mood Engine</h2>
            <p className="mt-2 text-sm text-white/70">
              Real-time sentiment and dance-floor response metrics.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <p className="text-xs uppercase tracking-widest text-white/65">Energy</p>
                <p className="mt-2 text-3xl font-semibold">92%</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <p className="text-xs uppercase tracking-widest text-white/65">Romance Mode</p>
                <p className="mt-2 text-3xl font-semibold">78%</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 p-4 sm:col-span-2 lg:col-span-1">
                <p className="text-xs uppercase tracking-widest text-white/65">Genre Confidence</p>
                <p className="mt-2 text-3xl font-semibold">96%</p>
              </div>
            </div>
          </article>

          <article id="settings" className="glass-panel animate-fade-up rounded-2xl p-5 md:p-6">
            <h2 className="text-xl font-semibold md:text-2xl">Settings</h2>
            <p className="mt-2 text-sm text-white/70">
              Configure your default event behavior and personalization.
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <p className="text-sm text-white/65">Default Vibe Profile</p>
                <p className="mt-1 font-semibold">Luxury Celebration</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <p className="text-sm text-white/65">Auto Requests</p>
                <p className="mt-1 font-semibold">Enabled</p>
              </div>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
