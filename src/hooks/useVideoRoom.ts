// Video-room lifecycle hook — the single home for room business logic.
//
// It owns provider join/leave, connection state, participants, local media
// toggles, reconnect, and error mapping. The page is pure presentation and only
// consumes this hook; it never touches a provider directly.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVideoRoomProviderFactory } from "@/lib/video";
import type {
  ConnectionState,
  RemoteParticipant,
  RoomCredential,
  ScreenShareState,
  VideoRoomEvents,
  VideoRoomProvider,
} from "@/lib/video";
import { VideoRoomError } from "@/lib/video";

const IDLE_SHARE: ScreenShareState = {
  active: false,
  sharer: null,
  participantId: null,
  participantName: null,
};

export interface UseVideoRoomArgs {
  credential: RoomCredential;
  displayName: string;
}

export interface VideoRoomController {
  connectionState: ConnectionState;
  remoteParticipants: RemoteParticipant[];
  cameraOn: boolean;
  micOn: boolean;
  error: VideoRoomError | null;
  screenShare: ScreenShareState;
  screenShareBusy: boolean;
  toggleCamera: () => Promise<void>;
  toggleMicrophone: () => Promise<void>;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
  leave: () => Promise<void>;
  retry: () => void;
  attachLocalVideo: (el: HTMLElement | null) => void;
  attachRemoteVideo: (participantId: string, el: HTMLElement | null) => void;
  attachSharedScreen: (el: HTMLElement | null) => void;
  attachRemoteScreen: (participantId: string, el: HTMLElement | null) => void;
}

export function useVideoRoom({ credential, displayName }: UseVideoRoomArgs): VideoRoomController {
  const factory = useVideoRoomProviderFactory();
  const providerRef = useRef<VideoRoomProvider | null>(null);

  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [error, setError] = useState<VideoRoomError | null>(null);
  const [screenShare, setScreenShare] = useState<ScreenShareState>(IDLE_SHARE);
  const [screenShareBusy, setScreenShareBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Keep the latest inputs in refs so unrelated re-renders don't trigger a
  // rejoin — only a new credential/token or an explicit retry does.
  const latest = useRef({ credential, displayName });
  latest.current = { credential, displayName };
  const joinKey = useMemo(
    () => `${credential.sessionId}:${credential.token}`,
    [credential.sessionId, credential.token]
  );

  useEffect(() => {
    let cancelled = false;
    const provider = factory();
    providerRef.current = provider;
    setError(null);
    setConnectionState("connecting");
    setRemoteParticipants([]);
    setScreenShare(IDLE_SHARE);

    const events: VideoRoomEvents = {
      onConnectionState: (s) => !cancelled && setConnectionState(s),
      onParticipantsChanged: (p) => !cancelled && setRemoteParticipants(p),
      onLocalMediaChanged: ({ cameraOn, micOn }) => {
        if (cancelled) return;
        setCameraOn(cameraOn);
        setMicOn(micOn);
      },
      onScreenShareChanged: (s) => !cancelled && setScreenShare(s),
      onError: (e) => !cancelled && setError(e),
    };

    provider
      .join({
        credential: latest.current.credential,
        displayName: latest.current.displayName,
        cameraOn: true,
        micOn: true,
        events,
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof VideoRoomError ? e : new VideoRoomError("provider_unavailable"));
        setConnectionState("failed");
      });

    return () => {
      cancelled = true;
      void provider.leave();
      providerRef.current = null;
    };
    // joinKey + attempt are the only intentional rejoin triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factory, joinKey, attempt]);

  const toggleCamera = useCallback(async () => {
    const next = !cameraOn;
    setCameraOn(next);
    await providerRef.current?.setCameraEnabled(next);
  }, [cameraOn]);

  const toggleMicrophone = useCallback(async () => {
    const next = !micOn;
    setMicOn(next);
    await providerRef.current?.setMicrophoneEnabled(next);
  }, [micOn]);

  const startScreenShare = useCallback(async () => {
    // Requesting the browser picker — surface a loading state until it resolves.
    setScreenShareBusy(true);
    try {
      await providerRef.current?.startScreenShare();
    } finally {
      setScreenShareBusy(false);
    }
  }, []);

  const stopScreenShare = useCallback(async () => {
    await providerRef.current?.stopScreenShare();
  }, []);

  const leave = useCallback(async () => {
    await providerRef.current?.leave();
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const attachLocalVideo = useCallback(
    (el: HTMLElement | null) => providerRef.current?.attachLocalVideo(el),
    []
  );
  const attachRemoteVideo = useCallback(
    (id: string, el: HTMLElement | null) => providerRef.current?.attachRemoteVideo(id, el),
    []
  );
  const attachSharedScreen = useCallback(
    (el: HTMLElement | null) => providerRef.current?.attachSharedScreen(el),
    []
  );
  const attachRemoteScreen = useCallback(
    (id: string, el: HTMLElement | null) => providerRef.current?.attachRemoteScreen(id, el),
    []
  );

  return {
    connectionState,
    remoteParticipants,
    cameraOn,
    micOn,
    error,
    screenShare,
    screenShareBusy,
    toggleCamera,
    toggleMicrophone,
    startScreenShare,
    stopScreenShare,
    leave,
    retry,
    attachLocalVideo,
    attachRemoteVideo,
    attachSharedScreen,
    attachRemoteScreen,
  };
}
