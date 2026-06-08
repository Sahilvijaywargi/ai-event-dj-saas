import "server-only";

import {
  PlaybackCommandResult,
  SpotifyDevice,
  SpotifyQueueState,
  SpotifyPlaybackState,
} from "@/lib/spotify/types";
import { ensureSpotifyTransportAuth, spotifyAuthenticatedFetch } from "@/lib/spotify/service";

async function spotifyPlaybackRequest<T>(
  userId: string,
  path: string,
  options?: RequestInit,
  expectJson = true,
): Promise<T> {
  const auth = await ensureSpotifyTransportAuth({
    userId,
    minValidityMs: 90_000,
    supervisedExecutionActive: true,
    reason: `playback_request:${path}`,
  });
  if (!auth.ok) {
    throw new Error("Spotify playback blocked due to auth expiry.");
  }

  return spotifyAuthenticatedFetch<T>({
    userId,
    path,
    options,
    expectJson,
    errorPrefix: "Spotify playback API",
  });
}

export async function getAvailableSpotifyDevices(userId: string): Promise<SpotifyDevice[]> {
  const data = await spotifyPlaybackRequest<{ devices: SpotifyDevice[] }>(userId, "/me/player/devices");
  return data.devices ?? [];
}

export async function transferSpotifyPlayback(params: {
  userId: string;
  deviceId: string;
  play?: boolean;
}): Promise<PlaybackCommandResult> {
  await spotifyPlaybackRequest<void>(
    params.userId,
    "/me/player",
    {
      method: "PUT",
      body: JSON.stringify({
        device_ids: [params.deviceId],
        play: params.play ?? false,
      }),
    },
    false,
  );
  return { ok: true, message: null };
}

export async function getSpotifyPlaybackState(userId: string): Promise<SpotifyPlaybackState | null> {
  try {
    const raw = await spotifyPlaybackRequest<{
      is_playing: boolean;
      progress_ms: number;
      repeat_state: string;
      shuffle_state: boolean;
      device: SpotifyDevice | null;
      item: { id: string | null; name: string; uri: string | null; duration_ms: number; artists: Array<{ name: string }> } | null;
    }>(userId, "/me/player");
    return {
      isPlaying: raw.is_playing ?? false,
      progressMs: raw.progress_ms ?? 0,
      device: raw.device ?? null,
      track: raw.item
        ? {
            id: raw.item.id,
            name: raw.item.name,
            uri: raw.item.uri,
            durationMs: raw.item.duration_ms,
            artistName: raw.item.artists[0]?.name ?? "Unknown Artist",
          }
        : null,
      repeatState: raw.repeat_state ?? null,
      shuffleState: Boolean(raw.shuffle_state),
    };
  } catch {
    return null;
  }
}

export async function startSpotifyPlayback(params: {
  userId: string;
  deviceId?: string;
  uris?: string[];
  positionMs?: number;
}): Promise<PlaybackCommandResult> {
  const query = params.deviceId ? `?device_id=${encodeURIComponent(params.deviceId)}` : "";
  await spotifyPlaybackRequest<void>(
    params.userId,
    `/me/player/play${query}`,
    {
      method: "PUT",
      body: JSON.stringify({
        uris: params.uris,
        position_ms: params.positionMs,
      }),
    },
    false,
  );
  return { ok: true, message: null };
}

export async function pauseSpotifyPlayback(userId: string): Promise<PlaybackCommandResult> {
  await spotifyPlaybackRequest<void>(userId, "/me/player/pause", { method: "PUT" }, false);
  return { ok: true, message: null };
}

export async function skipSpotifyTrack(userId: string): Promise<PlaybackCommandResult> {
  await spotifyPlaybackRequest<void>(userId, "/me/player/next", { method: "POST" }, false);
  return { ok: true, message: null };
}

export async function queueSpotifyTrack(params: {
  userId: string;
  uri: string;
  deviceId?: string;
}): Promise<PlaybackCommandResult> {
  const query = new URLSearchParams({ uri: params.uri });
  if (params.deviceId) query.set("device_id", params.deviceId);
  await spotifyPlaybackRequest<void>(params.userId, `/me/player/queue?${query.toString()}`, { method: "POST" }, false);
  return { ok: true, message: null };
}

export async function getSpotifyQueueState(userId: string): Promise<SpotifyQueueState | null> {
  try {
    const raw = await spotifyPlaybackRequest<{
      currently_playing: {
        id: string | null;
        uri: string | null;
        name: string;
        artists: Array<{ name: string }>;
      } | null;
      queue: Array<{
        id: string | null;
        uri: string | null;
        name: string;
        artists: Array<{ name: string }>;
      }>;
    }>(userId, "/me/player/queue");
    return {
      currentlyPlaying: raw.currently_playing
        ? {
            id: raw.currently_playing.id,
            uri: raw.currently_playing.uri,
            name: raw.currently_playing.name,
            artistName: raw.currently_playing.artists?.[0]?.name ?? "Unknown Artist",
          }
        : null,
      queue:
        raw.queue?.map((track) => ({
          id: track.id,
          uri: track.uri,
          name: track.name,
          artistName: track.artists?.[0]?.name ?? "Unknown Artist",
        })) ?? [],
    };
  } catch {
    return null;
  }
}

export async function setSpotifyVolume(params: {
  userId: string;
  volumePercent: number;
  deviceId?: string;
}): Promise<PlaybackCommandResult> {
  const query = new URLSearchParams({
    volume_percent: String(Math.max(0, Math.min(100, Math.round(params.volumePercent)))),
  });
  if (params.deviceId) query.set("device_id", params.deviceId);
  await spotifyPlaybackRequest<void>(params.userId, `/me/player/volume?${query.toString()}`, { method: "PUT" }, false);
  return { ok: true, message: null };
}

export async function seekSpotifyPlayback(params: {
  userId: string;
  positionMs: number;
  deviceId?: string;
}): Promise<PlaybackCommandResult> {
  const query = new URLSearchParams({
    position_ms: String(Math.max(0, Math.round(params.positionMs))),
  });
  if (params.deviceId) query.set("device_id", params.deviceId);
  await spotifyPlaybackRequest<void>(params.userId, `/me/player/seek?${query.toString()}`, { method: "PUT" }, false);
  return { ok: true, message: null };
}

