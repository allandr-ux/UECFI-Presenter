import type { LiveState, RemoteParticipant } from '../../shared/types';

export const MAIN_ROOM_CAMERA_ID = 'mainRoomCamera';

/**
 * Builds the effective LiveState for the Overflow Room screen:
 * - `feedSource === 'remote'`: Shows live remote participant (or slides only if none is live).
 * - `feedSource === 'camera'`: Shows Main Room Camera (if enabled), or slides only (hiding remote guests).
 * - `feedSource === 'auto'` (default): Shows live remote participant if any, else Main Room Camera if enabled.
 */
export function buildOverflowLiveState(liveState: LiveState | null): LiveState | null {
  if (!liveState) return null;

  const source = liveState.overflow?.feedSource ?? 'auto';
  const hasLiveRemoteParticipant = (liveState.participants?.liveParticipantIds?.length ?? 0) > 0;

  const overflow = liveState.overflow;
  const applyOverflowLayout = (baseParticipants: LiveState['participants']): LiveState['participants'] => {
    if (!overflow || !baseParticipants) return baseParticipants;
    return {
      ...baseParticipants,
      layout: overflow.layout,
      fullCropSides: overflow.fullCropSides,
      studioBackground: overflow.studioBackground,
      studioPresentationBox: overflow.studioPresentationBox,
      studioParticipantBox: overflow.studioParticipantBox,
      studioElements: overflow.studioElements
    };
  };

  if (source === 'remote' || (source === 'auto' && hasLiveRemoteParticipant)) {
    return overflow
      ? {
          ...liveState,
          participants: applyOverflowLayout(liveState.participants)
        }
      : liveState;
  }

  if (!liveState.overflow?.enabled) {
    if (source === 'camera' && hasLiveRemoteParticipant && liveState.participants) {
      return {
        ...liveState,
        participants: {
          ...liveState.participants,
          liveParticipantIds: []
        }
      };
    }
    return liveState;
  }

  const syntheticCam: RemoteParticipant = {
    id: MAIN_ROOM_CAMERA_ID,
    name: 'Main Room',
    joinedAt: 0,
    status: 'live',
    audioEnabled: false,
    videoEnabled: true,
    mutedByOperator: true,
    videoHiddenByOperator: false,
    source: 'lan'
  };

  return {
    ...liveState,
    participantList: [...(liveState.participantList ?? []), syntheticCam],
    participants: {
      layout: liveState.overflow.layout,
      liveParticipantIds: [MAIN_ROOM_CAMERA_ID],
      fullCropSides: liveState.overflow.fullCropSides,
      showNameplate: false,
      studioBackground: liveState.overflow.studioBackground,
      studioPresentationBox: liveState.overflow.studioPresentationBox,
      studioParticipantBox: liveState.overflow.studioParticipantBox,
      studioElements: liveState.overflow.studioElements
    }
  };
}
