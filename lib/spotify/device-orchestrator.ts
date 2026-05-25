import "server-only";

import {
  getAvailableSpotifyDevices,
  getSpotifyPlaybackState,
  queueSpotifyTrack,
  transferSpotifyPlayback,
} from "@/lib/spotify/playback-service";
import {
  markPlaybackDesync,
  markPlaybackResynced,
  touchRuntimeHeartbeat,
  withTransientRetry,
} from "@/lib/runtime/reliability";

export async function selectActiveDevice(params: { userId: string; deviceId: string; play?: boolean }) {
  return transferSpotifyPlayback({
    userId: params.userId,
    deviceId: params.deviceId,
    play: params.play ?? false,
  });
}

export async function getPlaybackOrchestrationState(userId: string) {
  const [devices, playback] = await Promise.all([
    withTransientRetry({
      userId,
      actionName: "get_available_devices",
      fn: () => getAvailableSpotifyDevices(userId),
    }),
    withTransientRetry({
      userId,
      actionName: "get_playback_state",
      fn: () => getSpotifyPlaybackState(userId),
    }),
  ]);
  const activeDevice = devices.find((device) => device.is_active) ?? playback?.device ?? null;
  const playbackSynced = Boolean(activeDevice && playback);
  if (!playbackSynced) {
    markPlaybackDesync(userId, "Playback orchestration detected missing active device/state.");
  } else {
    markPlaybackResynced(userId, { activeDeviceId: activeDevice?.id ?? null });
    touchRuntimeHeartbeat(userId, { source: "playback_orchestrator" });
  }

  return {
    devices,
    activeDevice,
    playbackState: playback,
    queueStatus: {
      canQueue: Boolean(activeDevice && !activeDevice.is_restricted),
      syncStatus: playbackSynced ? "synced" : "no_active_device",
    },
  };
}

export async function queueAiRecommendedTrack(params: {
  userId: string;
  spotifyTrackId: string;
  deviceId?: string;
}) {
  return queueSpotifyTrack({
    userId: params.userId,
    uri: `spotify:track:${params.spotifyTrackId}`,
    deviceId: params.deviceId,
  });
}

