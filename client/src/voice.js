// Real-time Peer-to-Peer Voice Chat Manager using WebRTC and Web Audio API.
// 100% free, room-scoped signaling via Socket.IO, zero server recording or storage.

export class VoiceManager {
  constructor() {
    this.socket = null;
    this.request = null;
    this.iceServers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
    this.myPlayerId = null;

    this.active = false;
    this.isMuted = false;
    this.isDeafened = false;

    this.localStream = null;
    this.peers = new Map(); // peerId -> { pc, audioEl, analyser, iceQueue }
    this.speaking = new Map(); // peerId -> boolean (including 'me')

    this.audioContext = null;
    this.localAnalyser = null;
    this.meterTimer = null;

    this.onStateChange = () => {};
    this.onSpeakingChange = () => {};
    this.onError = () => {};
  }

  static isSupported() {
    return (
      typeof window !== 'undefined' &&
      !!(window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    );
  }

  init({ socket, request, iceServers, myPlayerId, onStateChange, onSpeakingChange, onError }) {
    this.socket = socket;
    this.request = request;
    if (iceServers && Array.isArray(iceServers) && iceServers.length > 0) {
      this.iceServers = iceServers;
    }
    this.myPlayerId = myPlayerId;
    this.onStateChange = onStateChange || (() => {});
    this.onSpeakingChange = onSpeakingChange || (() => {});
    this.onError = onError || (() => {});

    this._bindSocketListeners();
  }

  updateConfig({ iceServers, myPlayerId }) {
    if (iceServers && Array.isArray(iceServers) && iceServers.length > 0) {
      this.iceServers = iceServers;
    }
    if (myPlayerId) {
      this.myPlayerId = myPlayerId;
    }
  }

  _bindSocketListeners() {
    if (!this.socket) return;
    this._unbindSocketListeners();

    this._onPeerJoined = (data) => this._handlePeerJoined(data);
    this._onPeerLeft = (data) => this._handlePeerLeft(data);
    this._onPeerMute = (data) => this._handlePeerMute(data);
    this._onSignal = (data) => this._handleSignal(data);

    this.socket.on('voice:peer-joined', this._onPeerJoined);
    this.socket.on('voice:peer-left', this._onPeerLeft);
    this.socket.on('voice:peer-mute', this._onPeerMute);
    this.socket.on('voice:signal', this._onSignal);
  }

  _unbindSocketListeners() {
    if (!this.socket) return;
    if (this._onPeerJoined) this.socket.off('voice:peer-joined', this._onPeerJoined);
    if (this._onPeerLeft) this.socket.off('voice:peer-left', this._onPeerLeft);
    if (this._onPeerMute) this.socket.off('voice:peer-mute', this._onPeerMute);
    if (this._onSignal) this.socket.off('voice:signal', this._onSignal);
  }

  /**
   * Request mic permissions and activate voice chat.
   * Permission is ONLY requested here upon deliberate user action.
   */
  async join({ startMuted = false } = {}) {
    if (this.active) return true;
    if (!VoiceManager.isSupported()) {
      this.onError({ code: 'NOT_SUPPORTED', message: 'WebRTC voice is not supported in this browser' });
      return false;
    }

    try {
      // Initialize AudioContext on user gesture
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        if (!this.audioContext || this.audioContext.state === 'closed') {
          this.audioContext = new AudioCtx();
        }
        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
        }
      }

      // Request microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      this.localStream = stream;
      this.active = true;
      this.isMuted = !!startMuted;
      this.isDeafened = false;

      // Apply initial mute state to local track
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !this.isMuted;
      }

      // Set up local voice activity analyzer
      this._setupLocalAnalyser(stream);

      // Notify server and retrieve currently active peers in the room
      const res = await this.request('voice:join', { muted: this.isMuted });
      if (!res.ok) {
        this.leave();
        this.onError(res.error || { code: 'JOIN_FAILED' });
        return false;
      }

      // Initiate WebRTC offer to each existing active peer
      const existingPeers = res.peers || [];
      for (const peer of existingPeers) {
        if (peer.id && peer.id !== this.myPlayerId) {
          this._initiateOffer(peer.id);
        }
      }

      this._startSpeakingMeter();
      this._notifyState();
      return true;
    } catch (err) {
      this.leave();
      const code = err.name === 'NotAllowedError' ? 'PERMISSION_DENIED' : 'MIC_ERROR';
      this.onError({ code, message: err.message || 'Microphone access failed' });
      return false;
    }
  }

  /**
   * Leave voice chat completely, closing all peer connections and stopping tracks.
   */
  leave() {
    this._stopSpeakingMeter();

    // Close and remove all peer connections
    for (const [peerId, peer] of this.peers.entries()) {
      try {
        peer.pc.close();
      } catch {}
      if (peer.audioEl) {
        try {
          peer.audioEl.pause();
          peer.audioEl.srcObject = null;
          peer.audioEl.remove();
        } catch {}
      }
    }
    this.peers.clear();
    this.speaking.clear();

    // Stop local microphone tracks
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        try {
          track.stop();
        } catch {}
      }
      this.localStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }
    this.localAnalyser = null;

    if (this.active) {
      this.active = false;
      this.request('voice:leave').catch(() => {});
    }

    this._notifyState();
    this.onSpeakingChange(new Map());
  }

  toggleMute() {
    if (!this.active) return;
    this.setMuted(!this.isMuted);
  }

  setMuted(muted) {
    if (!this.active) return;
    this.isMuted = !!muted;
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = !this.isMuted;
      }
    }
    if (this.isMuted) {
      this.speaking.set('me', false);
      if (this.myPlayerId) this.speaking.set(this.myPlayerId, false);
      this.onSpeakingChange(new Map(this.speaking));
    }
    this.request('voice:mute', { muted: this.isMuted }).catch(() => {});
    this._notifyState();
  }

  toggleDeafen() {
    if (!this.active) return;
    this.setDeafened(!this.isDeafened);
  }

  setDeafened(deafened) {
    if (!this.active) return;
    this.isDeafened = !!deafened;
    // Mute/unmute all peer audio elements
    for (const peer of this.peers.values()) {
      if (peer.audioEl) {
        peer.audioEl.muted = this.isDeafened;
      }
    }
    // Automatically mute microphone when deafened to prevent echo
    if (this.isDeafened && !this.isMuted) {
      this.setMuted(true);
    }
    this._notifyState();
  }

  // ---------- WebRTC Mesh Signaling ----------

  _createPeerConnection(peerId) {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const peerData = {
      pc,
      audioEl: null,
      analyser: null,
      iceQueue: [],
    };
    this.peers.set(peerId, peerData);

    // Add local audio tracks to peer connection
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && this.active) {
        this.request('voice:signal', {
          to: peerId,
          signal: { type: 'candidate', candidate: event.candidate },
        }).catch(() => {});
      }
    };

    // Handle incoming audio track
    pc.ontrack = (event) => {
      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      this._setupRemoteAudio(peerId, remoteStream, peerData);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this._removePeer(peerId);
      }
    };

    return peerData;
  }

  async _initiateOffer(peerId) {
    if (!this.active) return;
    const peerData = this.peers.get(peerId) || this._createPeerConnection(peerId);
    const { pc } = peerData;

    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      await pc.setLocalDescription(offer);

      await this.request('voice:signal', {
        to: peerId,
        signal: { type: 'offer', sdp: pc.localDescription },
      });
    } catch (err) {
      console.warn(`[Voice] Offer error for peer ${peerId}:`, err);
    }
  }

  async _handleSignal({ from: peerId, signal }) {
    if (!this.active || !signal || !peerId || peerId === this.myPlayerId) return;

    let peerData = this.peers.get(peerId);
    if (!peerData) {
      peerData = this._createPeerConnection(peerId);
    }
    const { pc } = peerData;

    try {
      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        // Drain any queued ICE candidates
        while (peerData.iceQueue.length > 0) {
          const cand = peerData.iceQueue.shift();
          await pc.addIceCandidate(cand).catch(() => {});
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await this.request('voice:signal', {
          to: peerId,
          signal: { type: 'answer', sdp: pc.localDescription },
        });
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        while (peerData.iceQueue.length > 0) {
          const cand = peerData.iceQueue.shift();
          await pc.addIceCandidate(cand).catch(() => {});
        }
      } else if (signal.type === 'candidate' && signal.candidate) {
        const candidate = new RTCIceCandidate(signal.candidate);
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(candidate);
        } else {
          peerData.iceQueue.push(candidate);
        }
      }
    } catch (err) {
      console.warn(`[Voice] Signal error for peer ${peerId}:`, err);
    }
  }

  _handlePeerJoined({ peerId }) {
    // When a new peer joins, we let the new peer initiate the offer to existing peers,
    // which prevents offer glare/collisions.
  }

  _handlePeerLeft({ peerId }) {
    this._removePeer(peerId);
  }

  _handlePeerMute({ peerId, muted }) {
    if (muted) {
      this.speaking.set(peerId, false);
      this.onSpeakingChange(new Map(this.speaking));
    }
  }

  _setupRemoteAudio(peerId, remoteStream, peerData) {
    // Hidden <audio> element for playback
    let audioEl = peerData.audioEl;
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.playsInline = true;
      audioEl.style.display = 'none';
      document.body.appendChild(audioEl);
      peerData.audioEl = audioEl;
    }
    audioEl.muted = this.isDeafened;
    audioEl.srcObject = remoteStream;
    audioEl.play().catch(() => {
      // Autoplay blocked: will resume on next user interaction
    });

    // Remote audio analyser for speaking indicator
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        const source = this.audioContext.createMediaStreamSource(remoteStream);
        const analyser = this.audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5;
        source.connect(analyser);
        peerData.analyser = analyser;
      } catch (err) {
        console.warn(`[Voice] Analyser setup error for peer ${peerId}:`, err);
      }
    }
  }

  _setupLocalAnalyser(stream) {
    if (!this.audioContext || this.audioContext.state === 'closed') return;
    try {
      const source = this.audioContext.createMediaStreamSource(stream);
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      this.localAnalyser = analyser;
    } catch (err) {
      console.warn('[Voice] Local analyser error:', err);
    }
  }

  _startSpeakingMeter() {
    this._stopSpeakingMeter();
    const dataArray = new Uint8Array(128);

    const getVolume = (analyser) => {
      if (!analyser) return 0;
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      return sum / dataArray.length;
    };

    this.meterTimer = setInterval(() => {
      let changed = false;

      // Local speaking detection
      if (this.active && !this.isMuted && this.localAnalyser) {
        const vol = getVolume(this.localAnalyser);
        const isSpeaking = vol > 12; // threshold for voice activity
        const myId = this.myPlayerId;
        if (this.speaking.get('me') !== isSpeaking) {
          this.speaking.set('me', isSpeaking);
          if (myId) this.speaking.set(myId, isSpeaking);
          changed = true;
        }
      } else if (this.speaking.get('me')) {
        this.speaking.set('me', false);
        if (this.myPlayerId) this.speaking.set(this.myPlayerId, false);
        changed = true;
      }

      // Remote peers speaking detection
      for (const [peerId, peer] of this.peers.entries()) {
        if (peer.analyser && !this.isDeafened) {
          const vol = getVolume(peer.analyser);
          const isSpeaking = vol > 12;
          if (this.speaking.get(peerId) !== isSpeaking) {
            this.speaking.set(peerId, isSpeaking);
            changed = true;
          }
        } else if (this.speaking.get(peerId)) {
          this.speaking.set(peerId, false);
          changed = true;
        }
      }

      if (changed) {
        this.onSpeakingChange(new Map(this.speaking));
      }
    }, 120);
  }

  _stopSpeakingMeter() {
    if (this.meterTimer) {
      clearInterval(this.meterTimer);
      this.meterTimer = null;
    }
  }

  _removePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    try {
      peer.pc.close();
    } catch {}
    if (peer.audioEl) {
      try {
        peer.audioEl.pause();
        peer.audioEl.srcObject = null;
        peer.audioEl.remove();
      } catch {}
    }
    this.peers.delete(peerId);
    this.speaking.delete(peerId);
    this.onSpeakingChange(new Map(this.speaking));
  }

  _notifyState() {
    this.onStateChange({
      active: this.active,
      isMuted: this.isMuted,
      isDeafened: this.isDeafened,
      peerCount: this.peers.size,
    });
  }

  destroy() {
    this._unbindSocketListeners();
    this.leave();
  }
}
