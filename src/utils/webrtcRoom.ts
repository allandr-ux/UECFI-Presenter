import type { ParticipantNetworkSettings, ParticipantSignalMessage } from '../../shared/types';

export function buildIceServers(settings?: Partial<ParticipantNetworkSettings> | null): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: settings?.stunUrl?.trim() || 'stun:stun.l.google.com:19302' }
  ];
  const turnUrl = settings?.turnUrl?.trim();
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      ...(settings?.turnUsername?.trim() ? { username: settings.turnUsername.trim() } : {}),
      ...(settings?.turnCredential?.trim() ? { credential: settings.turnCredential.trim() } : {})
    });
  }
  return servers;
}

/**
 * Manages outbound WebRTC peer connections from a remote participant's device
 * to subscribed screens (Main Screen, Operator Preview, Stage View).
 */
export class ParticipantBroadcaster {
  private participantId: string;
  private localStream: MediaStream | null = null;
  private peers = new Map<string, RTCPeerConnection>();
  private peerTrackSignatures = new Map<string, string>();
  private pendingIce = new Map<string, RTCIceCandidateInit[]>();
  private iceServers: RTCIceServer[];
  private sendSignal: (msg: ParticipantSignalMessage) => void;

  constructor(options: {
    participantId: string;
    localStream: MediaStream | null;
    iceServers: RTCIceServer[];
    sendSignal: (msg: ParticipantSignalMessage) => void;
  }) {
    this.participantId = options.participantId;
    this.localStream = options.localStream;
    this.iceServers = options.iceServers;
    this.sendSignal = options.sendSignal;
  }

  public setLocalStream(stream: MediaStream | null) {
    this.localStream = stream;
    for (const pc of this.peers.values()) {
      const senders = pc.getSenders();
      if (!stream) {
        senders.forEach((s) => pc.removeTrack(s));
        continue;
      }
      for (const track of stream.getTracks()) {
        const existing =
          senders.find((s) => s.track?.kind === track.kind) ??
          (stream.getTracks().length === 1 ? senders[0] : undefined);
        if (existing) {
          existing.replaceTrack(track).catch(() => {});
        } else {
          pc.addTrack(track, stream);
        }
      }
    }
  }

  public hasPeer(viewerId: string): boolean {
    const pc = this.peers.get(viewerId);
    return Boolean(pc && pc.connectionState !== 'failed' && pc.connectionState !== 'closed');
  }

  public hasPeerWithStream(viewerId: string, stream: MediaStream): boolean {
    const pc = this.peers.get(viewerId);
    if (!pc || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      return false;
    }
    const sig = stream
      .getTracks()
      .map((t) => `${t.kind}:${t.id}`)
      .sort()
      .join(',');
    return this.peerTrackSignatures.get(viewerId) === sig;
  }

  public async handleSubscribe(viewerId: string) {
    if (!this.localStream) return;
    // Recreate connection cleanly when a viewer subscribes
    this.closePeer(viewerId);

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.peers.set(viewerId, pc);
    this.peerTrackSignatures.set(
      viewerId,
      this.localStream
        .getTracks()
        .map((t) => `${t.kind}:${t.id}`)
        .sort()
        .join(',')
    );

    for (const track of this.localStream.getTracks()) {
      pc.addTrack(track, this.localStream);
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({
          type: 'RTC_ICE',
          fromId: `participant:${this.participantId}`,
          toId: viewerId,
          candidate: event.candidate.toJSON() as {
            candidate: string;
            sdpMid?: string | null;
            sdpMLineIndex?: number | null;
          }
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.closePeer(viewerId);
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (pc.localDescription?.sdp) {
      this.sendSignal({
        type: 'RTC_OFFER',
        fromId: `participant:${this.participantId}`,
        toId: viewerId,
        sdp: { type: 'offer', sdp: pc.localDescription.sdp }
      });
    }
  }

  public async handleSignal(msg: ParticipantSignalMessage) {
    if (msg.type === 'RTC_SUBSCRIBE' && msg.participantId === this.participantId) {
      await this.handleSubscribe(msg.viewerId);
      return;
    }

    if (msg.type === 'RTC_ANSWER' && msg.toId === `participant:${this.participantId}`) {
      const pc = this.peers.get(msg.fromId);
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      const queued = this.pendingIce.get(msg.fromId) ?? [];
      this.pendingIce.delete(msg.fromId);
      for (const candidate of queued) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      }
      return;
    }

    if (msg.type === 'RTC_ICE' && msg.toId === `participant:${this.participantId}`) {
      const pc = this.peers.get(msg.fromId);
      if (!pc) return;
      if (pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
      } else {
        const list = this.pendingIce.get(msg.fromId) ?? [];
        list.push(msg.candidate);
        this.pendingIce.set(msg.fromId, list);
      }
    }
  }

  private closePeer(viewerId: string) {
    const existing = this.peers.get(viewerId);
    if (existing) {
      existing.close();
      this.peers.delete(viewerId);
    }
    this.peerTrackSignatures.delete(viewerId);
    this.pendingIce.delete(viewerId);
  }

  public dispose() {
    for (const viewerId of Array.from(this.peers.keys())) {
      this.closePeer(viewerId);
    }
  }
}

/**
 * Manages inbound WebRTC peer connections for a screen viewer
 * (Main Screen, Stage View, or Operator Green Room preview).
 */
export class ScreenStreamReceiver {
  private viewerId: string;
  private iceServers: RTCIceServer[];
  private sendSignal: (msg: ParticipantSignalMessage) => void;
  private onStreamsChange: (streams: Map<string, MediaStream>) => void;
  private getReturnMedia?: (participantId: string) => {
    videoTrack: MediaStreamTrack | null;
    audioTrack: MediaStreamTrack | null;
  };
  private peers = new Map<string, RTCPeerConnection>();
  private streams = new Map<string, MediaStream>();
  private pendingIce = new Map<string, RTCIceCandidateInit[]>();

  constructor(options: {
    viewerId: string;
    iceServers: RTCIceServer[];
    sendSignal: (msg: ParticipantSignalMessage) => void;
    onStreamsChange: (streams: Map<string, MediaStream>) => void;
    getReturnMedia?: (participantId: string) => {
      videoTrack: MediaStreamTrack | null;
      audioTrack: MediaStreamTrack | null;
    };
  }) {
    this.viewerId = options.viewerId;
    this.iceServers = options.iceServers;
    this.sendSignal = options.sendSignal;
    this.onStreamsChange = options.onStreamsChange;
    this.getReturnMedia = options.getReturnMedia;
  }

  /**
   * Pushes updated return video/audio tracks (e.g. Main Room Camera + Room Audio)
   * to all connected remote speakers via RTCRtpSender.replaceTrack without renegotiation.
   */
  public syncReturnMedia() {
    if (!this.getReturnMedia) return;
    for (const [pid, pc] of this.peers.entries()) {
      if (pc.connectionState === 'closed' || pc.connectionState === 'failed') continue;
      const { videoTrack, audioTrack } = this.getReturnMedia(pid);
      for (const transceiver of pc.getTransceivers()) {
        const kind = transceiver.receiver.track?.kind ?? transceiver.sender.track?.kind;
        if (kind === 'video') {
          if (transceiver.sender.track !== videoTrack) {
            transceiver.sender.replaceTrack(videoTrack).catch(() => {});
          }
        } else if (kind === 'audio') {
          if (transceiver.sender.track !== audioTrack) {
            transceiver.sender.replaceTrack(audioTrack).catch(() => {});
          }
        }
      }
    }
  }

  public syncSubscriptions(participantIds: string[]) {
    const desired = new Set(participantIds);
    for (const existingId of Array.from(this.peers.keys())) {
      if (!desired.has(existingId)) {
        this.removeParticipant(existingId);
      }
    }
    for (const pid of desired) {
      const existingPc = this.peers.get(pid);
      if (
        !existingPc ||
        existingPc.connectionState === 'disconnected' ||
        existingPc.connectionState === 'failed' ||
        existingPc.connectionState === 'closed'
      ) {
        this.sendSignal({
          type: 'RTC_SUBSCRIBE',
          viewerId: this.viewerId,
          participantId: pid
        });
      }
    }
  }

  public async handleSignal(msg: ParticipantSignalMessage) {
    if (msg.type === 'RTC_OFFER' && msg.toId === this.viewerId && msg.fromId.startsWith('participant:')) {
      const pid = msg.fromId.slice('participant:'.length);
      this.closePeer(pid);

      const pc = new RTCPeerConnection({ iceServers: this.iceServers });
      this.peers.set(pid, pc);

      pc.ontrack = (event) => {
        let stream = event.streams[0];
        if (!stream) {
          // Accumulate tracks into a single MediaStream per participant so audio isn't dropped
          const existing = this.streams.get(pid);
          if (existing) {
            if (!existing.getTracks().some((t) => t.id === event.track.id)) {
              existing.addTrack(event.track);
            }
            stream = existing;
          } else {
            stream = new MediaStream([event.track]);
          }
        }
        this.streams.set(pid, stream);
        this.onStreamsChange(new Map(this.streams));
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendSignal({
            type: 'RTC_ICE',
            fromId: this.viewerId,
            toId: msg.fromId,
            candidate: event.candidate.toJSON() as {
              candidate: string;
              sdpMid?: string | null;
              sdpMLineIndex?: number | null;
            }
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          this.removeParticipant(pid);
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      const queued = this.pendingIce.get(pid) ?? [];
      this.pendingIce.delete(pid);
      for (const candidate of queued) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      }

      if (this.getReturnMedia) {
        const { videoTrack, audioTrack } = this.getReturnMedia(pid);
        for (const transceiver of pc.getTransceivers()) {
          const kind = transceiver.receiver.track?.kind;
          if (kind === 'video') {
            transceiver.direction = 'sendrecv';
            await transceiver.sender.replaceTrack(videoTrack).catch(() => {});
          } else if (kind === 'audio') {
            transceiver.direction = 'sendrecv';
            await transceiver.sender.replaceTrack(audioTrack).catch(() => {});
          }
        }
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (pc.localDescription?.sdp) {
        this.sendSignal({
          type: 'RTC_ANSWER',
          fromId: this.viewerId,
          toId: msg.fromId,
          sdp: { type: 'answer', sdp: pc.localDescription.sdp }
        });
      }
      return;
    }

    if (msg.type === 'RTC_ICE' && msg.toId === this.viewerId && msg.fromId.startsWith('participant:')) {
      const pid = msg.fromId.slice('participant:'.length);
      const pc = this.peers.get(pid);
      if (!pc) return;
      if (pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
      } else {
        const list = this.pendingIce.get(pid) ?? [];
        list.push(msg.candidate);
        this.pendingIce.set(pid, list);
      }
    }
  }

  public removeParticipant(pid: string) {
    this.closePeer(pid);
    if (this.streams.delete(pid)) {
      this.onStreamsChange(new Map(this.streams));
    }
  }

  private closePeer(pid: string) {
    const existing = this.peers.get(pid);
    if (existing) {
      existing.close();
      this.peers.delete(pid);
    }
    this.pendingIce.delete(pid);
  }

  public dispose() {
    for (const pid of Array.from(this.peers.keys())) {
      this.closePeer(pid);
    }
    this.streams.clear();
    this.onStreamsChange(new Map());
  }
}
