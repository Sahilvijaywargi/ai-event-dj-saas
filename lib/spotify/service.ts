import "server-only";

import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getServerEnv } from "@/lib/env/server";
import {
  SpotifyAudioFeatures,
  SpotifyConnectionRecord,
  SpotifyPlaylist,
  SpotifyProfile,
  SpotifyRecommendation,
  SpotifySearchItem,
  SpotifySearchType,
} from "@/lib/spotify/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SpotifyTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

export type SpotifyTransportAuthState = "healthy" | "refreshing" | "degraded" | "expired";

export type SpotifyTransportAuthContinuityState = {
  transportAuthState: SpotifyTransportAuthState;
  accessTokenExpiresAt: number | null;
  lastSuccessfulRefreshAt: number | null;
  refreshFailureCount: number;
  authRecoveryReasoning: string[];
};

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const SPOTIFY_ACCOUNTS_BASE = "https://accounts.spotify.com";
const transportAuthContinuityStore = new Map<string, SpotifyTransportAuthContinuityState>();

function getSpotifyConfig() {
  const env = getServerEnv();
  return {
    clientId: env.spotifyClientId,
    clientSecret: env.spotifyClientSecret,
    redirectUri: env.spotifyRedirectUri,
  };
}

function deriveEncryptionKey() {
  const secret = getServerEnv().spotifyTokenEncryptionSecret;
  return createHash("sha256").update(secret).digest();
}

export function encryptToken(value: string) {
  const key = deriveEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptToken(value: string) {
  const key = deriveEncryptionKey();
  const [ivBase64, tagBase64, encryptedBase64] = value.split(".");
  if (!ivBase64 || !tagBase64 || !encryptedBase64) {
    throw new Error("Invalid encrypted token format.");
  }
  const iv = Buffer.from(ivBase64, "base64");
  const tag = Buffer.from(tagBase64, "base64");
  const encrypted = Buffer.from(encryptedBase64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  let errorRef: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      errorRef = error;
      if (attempt === retries) break;
      await wait(300 * (attempt + 1));
    }
  }
  throw errorRef;
}

async function spotifyFetch<T>(
  accessToken: string,
  path: string,
  options?: RequestInit,
): Promise<T> {
  return withRetry(async () => {
    const response = await fetch(`${SPOTIFY_API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(options?.headers ?? {}),
      },
    });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "1");
      await wait(retryAfter * 1000);
      throw new Error("Spotify rate limit hit; retrying.");
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Spotify API error (${response.status}): ${text}`);
    }

    return (await response.json()) as T;
  }, 1);
}

function appendAuthReasoning(existing: string[], next: string) {
  return [...existing.slice(-7), next];
}

function getDefaultTransportAuthContinuityState(): SpotifyTransportAuthContinuityState {
  return {
    transportAuthState: "healthy",
    accessTokenExpiresAt: null,
    lastSuccessfulRefreshAt: null,
    refreshFailureCount: 0,
    authRecoveryReasoning: ["Spotify transport auth continuity initialized."],
  };
}

export function getSpotifyTransportAuthContinuityState(userId: string): SpotifyTransportAuthContinuityState {
  return transportAuthContinuityStore.get(userId) ?? getDefaultTransportAuthContinuityState();
}

type EnsureSpotifyTransportAuthParams = {
  userId: string;
  minValidityMs?: number;
  forceRefresh?: boolean;
  runtimeTickActive?: boolean;
  supervisedExecutionActive?: boolean;
  deviceHealthy?: boolean;
  reason?: string;
};

export async function ensureSpotifyTransportAuth(params: EnsureSpotifyTransportAuthParams) {
  const minValidityMs = params.minValidityMs ?? 90_000;
  const continuity = getSpotifyTransportAuthContinuityState(params.userId);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("spotify_connections")
    .select("*")
    .eq("user_id", params.userId)
    .maybeSingle();
  if (error) {
    const degraded: SpotifyTransportAuthContinuityState = {
      ...continuity,
      transportAuthState: "degraded",
      authRecoveryReasoning: appendAuthReasoning(
        continuity.authRecoveryReasoning,
        "Auth refresh failed while loading connection record.",
      ),
    };
    transportAuthContinuityStore.set(params.userId, degraded);
    return { ok: false, accessToken: null, state: degraded };
  }
  if (!data) {
    const expired: SpotifyTransportAuthContinuityState = {
      ...continuity,
      transportAuthState: "expired",
      accessTokenExpiresAt: null,
      authRecoveryReasoning: appendAuthReasoning(
        continuity.authRecoveryReasoning,
        "Execution blocked due to auth expiry or missing Spotify connection.",
      ),
    };
    transportAuthContinuityStore.set(params.userId, expired);
    return { ok: false, accessToken: null, state: expired };
  }
  const connection = data as SpotifyConnectionRecord;
  const now = Date.now();
  const expiresAtMs = new Date(connection.expires_at).getTime();
  let accessToken: string;
  let refreshToken: string | null = null;
  try {
    accessToken = decryptToken(connection.access_token);
    refreshToken = connection.refresh_token ? decryptToken(connection.refresh_token) : null;
  } catch {
    const degraded: SpotifyTransportAuthContinuityState = {
      ...continuity,
      transportAuthState: "degraded",
      accessTokenExpiresAt: expiresAtMs,
      refreshFailureCount: continuity.refreshFailureCount + 1,
      authRecoveryReasoning: appendAuthReasoning(
        continuity.authRecoveryReasoning,
        "Auth refresh failed because token decryption failed.",
      ),
    };
    transportAuthContinuityStore.set(params.userId, degraded);
    return { ok: false, accessToken: null, state: degraded };
  }
  const expiresSoon = now + minValidityMs >= expiresAtMs;
  const shouldRefresh = Boolean(params.forceRefresh) || expiresSoon;
  const canProactivelyRefresh =
    Boolean(params.runtimeTickActive) || Boolean(params.supervisedExecutionActive) || Boolean(params.reason);
  if (!shouldRefresh || !canProactivelyRefresh) {
    const healthy: SpotifyTransportAuthContinuityState = {
      ...continuity,
      transportAuthState: "healthy",
      accessTokenExpiresAt: expiresAtMs,
      authRecoveryReasoning: appendAuthReasoning(
        continuity.authRecoveryReasoning,
        "Auth healthy; proactive refresh not required.",
      ),
    };
    transportAuthContinuityStore.set(params.userId, healthy);
    return { ok: true, accessToken, state: healthy };
  }
  if (!refreshToken) {
    const expired: SpotifyTransportAuthContinuityState = {
      ...continuity,
      transportAuthState: expiresAtMs <= now ? "expired" : "degraded",
      accessTokenExpiresAt: expiresAtMs,
      refreshFailureCount: continuity.refreshFailureCount + 1,
      authRecoveryReasoning: appendAuthReasoning(
        continuity.authRecoveryReasoning,
        "Execution blocked due to auth expiry: refresh token missing.",
      ),
    };
    transportAuthContinuityStore.set(params.userId, expired);
    return { ok: false, accessToken: null, state: expired };
  }
  const refreshing: SpotifyTransportAuthContinuityState = {
    ...continuity,
    transportAuthState: "refreshing",
    accessTokenExpiresAt: expiresAtMs,
    authRecoveryReasoning: appendAuthReasoning(
      continuity.authRecoveryReasoning,
      "Refreshing Spotify auth proactively for supervised continuity.",
    ),
  };
  transportAuthContinuityStore.set(params.userId, refreshing);
  try {
    const refreshed = await refreshSpotifyToken(refreshToken);
    accessToken = refreshed.access_token;
    const newRefreshToken = refreshed.refresh_token ?? refreshToken;
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    const { error: updateError } = await supabase
      .from("spotify_connections")
      .update({
        access_token: encryptToken(accessToken),
        refresh_token: encryptToken(newRefreshToken),
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", params.userId);
    if (updateError) throw new Error(updateError.message);
    const healthy: SpotifyTransportAuthContinuityState = {
      ...refreshing,
      transportAuthState: "healthy",
      accessTokenExpiresAt: new Date(newExpiresAt).getTime(),
      lastSuccessfulRefreshAt: Date.now(),
      refreshFailureCount: 0,
      authRecoveryReasoning: appendAuthReasoning(
        refreshing.authRecoveryReasoning,
        params.runtimeTickActive
          ? "Runtime preserved auth continuity with proactive refresh."
          : "Auth refreshed proactively.",
      ),
    };
    transportAuthContinuityStore.set(params.userId, healthy);
    return { ok: true, accessToken, state: healthy };
  } catch {
    const failed: SpotifyTransportAuthContinuityState = {
      ...refreshing,
      transportAuthState: expiresAtMs <= now ? "expired" : "degraded",
      refreshFailureCount: continuity.refreshFailureCount + 1,
      authRecoveryReasoning: appendAuthReasoning(
        refreshing.authRecoveryReasoning,
        "Auth refresh failed; execution blocked due to auth continuity degradation.",
      ),
    };
    transportAuthContinuityStore.set(params.userId, failed);
    return { ok: false, accessToken: null, state: failed };
  }
}

export function getSpotifyConnectUrl(state: string) {
  const { clientId, redirectUri } = getSpotifyConfig();
  const scopes = [
    "user-read-email",
    "playlist-read-private",
    "user-library-read",
    "user-read-private",
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
    "streaming",
  ].join(" ");

  const url = new URL(`${SPOTIFY_ACCOUNTS_BASE}/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCodeForTokens(code: string): Promise<SpotifyTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getSpotifyConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) {
    throw new Error(`Spotify token exchange failed (${response.status}).`);
  }
  return (await response.json()) as SpotifyTokenResponse;
}

export async function refreshSpotifyToken(refreshToken: string): Promise<SpotifyTokenResponse> {
  const { clientId, clientSecret } = getSpotifyConfig();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) {
    throw new Error(`Spotify token refresh failed (${response.status}).`);
  }
  return (await response.json()) as SpotifyTokenResponse;
}

export async function fetchSpotifyProfile(accessToken: string): Promise<SpotifyProfile> {
  const data = await spotifyFetch<{ id: string; display_name: string }>(accessToken, "/me");
  return {
    id: data.id,
    display_name: data.display_name ?? "Spotify User",
  };
}

export async function upsertSpotifyConnection(params: {
  userId: string;
  profile: SpotifyProfile;
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}) {
  const supabase = await createSupabaseServerClient();
  const expiresAt = new Date(Date.now() + params.expiresInSeconds * 1000).toISOString();
  const { error } = await supabase.from("spotify_connections").upsert(
    {
      user_id: params.userId,
      spotify_user_id: params.profile.id,
      display_name: params.profile.display_name,
      access_token: encryptToken(params.accessToken),
      refresh_token: encryptToken(params.refreshToken),
      expires_at: expiresAt,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id",
    },
  );
  if (error) throw new Error(error.message);
}

export async function removeSpotifyConnection(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("spotify_connections").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function getValidSpotifyAccessToken(userId: string) {
  const auth = await ensureSpotifyTransportAuth({
    userId,
    minValidityMs: 90_000,
    reason: "general_access_token_validation",
  });
  if (!auth.ok || !auth.accessToken) {
    throw new Error("Spotify auth continuity degraded.");
  }
  return auth.accessToken;
}

export async function forceRefreshSpotifyAccessToken(userId: string) {
  const auth = await ensureSpotifyTransportAuth({
    userId,
    forceRefresh: true,
    minValidityMs: 0,
    reason: "forced_refresh",
  });
  if (!auth.ok || !auth.accessToken) {
    throw new Error("Spotify forced refresh failed.");
  }
  return auth.accessToken;
}

export async function getSpotifyPlaylists(userId: string): Promise<SpotifyPlaylist[]> {
  const accessToken = await getValidSpotifyAccessToken(userId);
  const data = await spotifyFetch<{
    items: Array<{ id: string; name: string; tracks: { total: number } }>;
  }>(accessToken, "/me/playlists?limit=20");
  return data.items.map((item) => ({
    id: item.id,
    name: item.name,
    tracksCount: item.tracks.total,
  }));
}

export async function getSpotifyLikedSongs(userId: string) {
  const accessToken = await getValidSpotifyAccessToken(userId);
  const data = await spotifyFetch<{
    items: Array<{ track: { id: string; name: string; artists: Array<{ name: string }> } }>;
  }>(accessToken, "/me/tracks?limit=20");
  return data.items.map((item) => ({
    id: item.track.id,
    name: item.track.name,
    artistName: item.track.artists[0]?.name ?? "Unknown Artist",
  }));
}

export async function searchSpotify(
  userId: string,
  query: string,
  type: SpotifySearchType,
): Promise<SpotifySearchItem[]> {
  const accessToken = await getValidSpotifyAccessToken(userId);

  const encoded = encodeURIComponent(query);

  const data = await spotifyFetch<{
    tracks?: {
      items: Array<{
        id: string;
        name: string;
        artists?: Array<{ name: string }>;
      }>;
    };

    artists?: {
      items: Array<{
        id: string;
        name: string;
      }>;
    };

    playlists?: {
      items: Array<{
        id: string;
        name: string;
      }>;
    };
  }>(
    accessToken,
    `/search?q=${encoded}&type=${type}&limit=10`,
  );

  if (type === "track") {
    return (data.tracks?.items ?? [])
      .filter((item) => item && item.id && item.name)
      .map((item) => ({
        id: item.id,
        name: item.name,
        type: "track" as const,
        artistName:
          item.artists?.[0]?.name ??
          "Unknown Artist",
      }));
  }

  if (type === "artist") {
    return (data.artists?.items ?? [])
      .filter((item) => item && item.id && item.name)
      .map((item) => ({
        id: item.id,
        name: item.name,
        type: "artist" as const,
      }));
  }

  return (data.playlists?.items ?? [])
    .filter((item) => item && item.id && item.name)
    .map((item) => ({
      id: item.id,
      name: item.name,
      type: "playlist" as const,
    }));
}

export async function getSpotifyAudioFeatures(
  userId: string,
  trackIds: string[],
): Promise<SpotifyAudioFeatures[]> {
  const accessToken = await getValidSpotifyAccessToken(userId);
  const ids = trackIds.slice(0, 50).join(",");
  const data = await spotifyFetch<{
    audio_features: Array<{
      id: string;
      tempo: number;
      energy: number;
      danceability: number;
      valence: number;
      speechiness: number;
      acousticness: number;
      instrumentalness: number;
      key: number;
      mode: 0 | 1;
    }>;
  }>(accessToken, `/audio-features?ids=${ids}`);
  return (data.audio_features ?? []).filter(Boolean);
}

export async function getSpotifyRecommendations(params: {
  userId: string;
  seedTracks?: string[];
  seedArtists?: string[];
  seedGenres?: string[];
  targetEnergy?: number;
}): Promise<SpotifyRecommendation[]> {
  const accessToken = await getValidSpotifyAccessToken(params.userId);
  const query = new URLSearchParams();
  if (params.seedTracks?.length) query.set("seed_tracks", params.seedTracks.slice(0, 5).join(","));
  if (params.seedArtists?.length) query.set("seed_artists", params.seedArtists.slice(0, 5).join(","));
  if (params.seedGenres?.length) query.set("seed_genres", params.seedGenres.slice(0, 5).join(","));
  if (typeof params.targetEnergy === "number") {
    query.set("target_energy", String(Math.min(1, Math.max(0, params.targetEnergy / 10))));
  }
  query.set("limit", "20");

  const data = await spotifyFetch<{
    tracks: Array<{ id: string; name: string; artists: Array<{ name: string }> }>;
  }>(accessToken, `/recommendations?${query.toString()}`);
  return (data.tracks ?? []).map((track) => ({
    id: track.id,
    name: track.name,
    artistName: track.artists[0]?.name ?? "Unknown Artist",
  }));
}

export async function getSpotifyConnectionStatus(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("spotify_connections")
    .select("spotify_user_id,display_name,connected_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function readSpotifyCache(userId: string, cacheKey: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("spotify_cache")
    .select("payload,expires_at")
    .eq("user_id", userId)
    .eq("cache_key", cacheKey)
    .maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data.payload;
}

export async function writeSpotifyCache(params: {
  userId: string;
  cacheKey: string;
  cacheType: "playlists" | "search" | "recommendations" | "liked_songs";
  payload: unknown;
  ttlSeconds: number;
}) {
  const supabase = await createSupabaseServerClient();
  const expiresAt = new Date(Date.now() + params.ttlSeconds * 1000).toISOString();
  const { error } = await supabase.from("spotify_cache").upsert(
    {
      user_id: params.userId,
      cache_key: params.cacheKey,
      cache_type: params.cacheType,
      payload: params.payload,
      expires_at: expiresAt,
    },
    { onConflict: "user_id,cache_key" },
  );
  if (error) throw new Error(error.message);
}

