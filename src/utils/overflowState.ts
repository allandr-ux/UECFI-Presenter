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
  const baseParticipants = liveState.participants;
  const hasLiveRemoteParticipant = (baseParticipants?.liveParticipantIds?.length ?? 0) > 0;

  if (source === 'remote' || (source === 'auto' && hasLiveRemoteParticipant)) {
    return liveState;
  }

  if (!liveState.overflow?.enabled) {
    if (source === 'camera' && hasLiveRemoteParticipant && baseParticipants) {
      return {
        ...liveState,
        participants: {
          ...baseParticipants,
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
      layout: baseParticipants?.layout ?? liveState.overflow.layout,
      liveParticipantIds: [MAIN_ROOM_CAMERA_ID],
      fullCropSides: baseParticipants?.fullCropSides ?? liveState.overflow.fullCropSides,
      showNameplate: false,
      studioBackground: baseParticipants?.studioBackground ?? liveState.overflow.studioBackground,
      studioPresentationBox:
        baseParticipants?.studioPresentationBox ?? liveState.overflow.studioPresentationBox,
      studioParticipantBox:
        baseParticipants?.studioParticipantBox ?? liveState.overflow.studioParticipantBox,
      studioElements: baseParticipants?.studioElements ?? liveState.overflow.studioElements
    }
  };
}
