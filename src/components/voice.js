/**
 * Mesh WebRTC voice / video / screen-share, signalled over Supabase Realtime.
 *
 * Design notes (why this is shaped the way it is):
 *
 *  - Every peer holds one RTCPeerConnection per other peer (a full mesh). For
 *    the handful of people a HUD voice room ever holds that beats an SFU,
 *    because media goes browser-to-browser: no server hop, so latency is
 *    whatever the direct path costs.
 *
 *  - Each connection negotiates exactly three m-lines up front -- audio, a
 *    camera video slot and a screen-share video slot -- all sendrecv with no
 *    track attached. Turning the camera on is then a replaceTrack() on an
 *    already-negotiated sender: it starts flowing on the next frame with no
 *    offer/answer round trip at all. (Attaching tracks on demand, the obvious
 *    approach, costs a full renegotiation through the signalling server every
 *    single toggle.) Empty slots encode nothing and cost nothing, so an
 *    audio-only room stays audio-only in CPU terms.
 *
 *  - Which slot a remote video belongs to is read off the transceiver's
 *    position in the m-line order, so "is this their cam or their screen?"
 *    needs no side-channel message. Turning a slot *off* does need one, since
 *    replaceTrack(null) just stops the frames without telling anyone.
 *
 *  - Renegotiation (only really needed after an ICE restart) uses perfect
 *    negotiation, with politeness decided by comparing peer ids, so two peers
 *    offering simultaneously can never deadlock.
 */

import { createRealtimeChannel } from './realtime.js';

const ICE_SERVERS = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  // Free public TURN relay. Mesh WebRTC over STUN alone fails behind the
  // symmetric NAT / UDP-blocking firewalls this HUD is usually used on, so a
  // relay fallback is the difference between "voice works" and "connecting...".
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turns:openrelay.metered.ca:443?transport=tcp"
    ],
    username: "openrelayproject",
    credential: "openrelayproject"
  }
];

// Slot index == m-line index. Fixed on both sides, so it needs no signalling.
const SLOT_AUDIO = 0;
const SLOT_CAM = 1;
const SLOT_SCREEN = 2;

const CAM_MAX_BITRATE = 400000;     // 400kbps is plenty for a small tile
const SCREEN_MAX_BITRATE = 2000000;

/**
 * Nudge Opus into low-latency conference settings: in-band FEC to ride out
 * packet loss without retransmits, DTX so silence costs almost nothing, a
 * modest bitrate cap, and 20ms packets.
 */
function tuneOpus(sdp) {
  return sdp
    .replace(/a=fmtp:(\d+) ([^\r\n]*minptime=[^\r\n]*)/g,
      (m, pt, params) => "a=fmtp:" + pt + " " + params + ";useinbandfec=1;usedtx=1;stereo=0;maxaveragebitrate=32000")
    .replace(/(a=rtpmap:\d+ opus\/48000\/2\r?\n)/g, "$1a=ptime:20\r\n");
}

async function capBitrate(sender, maxBitrate, degradationPreference) {
  if (!sender) return;
  try {
    const params = sender.getParameters();
    if (!params.encodings || !params.encodings.length) params.encodings = [{}];
    params.encodings[0].maxBitrate = maxBitrate;
    params.degradationPreference = degradationPreference;
    await sender.setParameters(params);
  } catch (e) { /* not supported everywhere; the cap is only an optimisation */ }
}

export function createVoiceSession({ supabaseUrl, supabaseKey, room, username, handlers = {} }) {
  const myPeerId = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);

  /** peerId -> { pc, name, transceivers, makingOffer, ignoreOffer, polite } */
  const peers = new Map();

  let micStream = null;
  let camStream = null;
  let screenStream = null;
  let muted = false;
  let active = false;

  let audioCtx = null;
  let speakingRaf = 0;

  const emit = (name, ...args) => { if (handlers[name]) handlers[name](...args); };

  const channel = createRealtimeChannel({
    supabaseUrl,
    supabaseKey,
    topic: "vc:" + room,
    presenceKey: myPeerId,
    onBroadcast: (event, payload) => {
      if (!payload || payload.to !== myPeerId) return; // signalling is unicast
      handleSignal(event, payload);
    },
    onPresence: (list) => {
      syncPeers(list);
      const others = list
        .filter(p => p.peerId && p.peerId !== myPeerId)
        .map(p => ({ peerId: p.peerId, username: p.username || "Guest", me: false }));
      emit("members", active
        ? [{ peerId: myPeerId, username, me: true }].concat(others)
        : others);
    },
    onStatus: (s) => emit("status", s)
  });

  function signal(to, event, payload) {
    channel.broadcast(event, Object.assign({}, payload, { to, from: myPeerId, name: username }));
  }

  // -- Peer lifecycle --------------------------------------------------------

  function createPeer(peerId, name) {
    if (peers.has(peerId)) return peers.get(peerId);

    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require"
    });

    // Lower id offers, higher id is polite -- both sides agree without asking.
    const entry = {
      pc,
      name,
      makingOffer: false,
      ignoreOffer: false,
      polite: myPeerId > peerId,
      transceivers: [],
      // What this peer is sending us: the live track per slot, and the last
      // on/off they announced. A tile shows only when both agree.
      remoteTracks: {},
      remoteMedia: { cam: true, screen: true }
    };
    peers.set(peerId, entry);

    // Only the offering side creates the m-lines. If both sides did, the
    // answerer's own (still unassociated) transceivers would not be matched
    // against the offer and it would counter-offer three more -- six m-lines
    // for a two-way call, with each direction on a different set.
    if (!entry.polite) {
      entry.transceivers = [
        pc.addTransceiver("audio", { direction: "sendrecv" }),
        pc.addTransceiver("video", { direction: "sendrecv" }),
        pc.addTransceiver("video", { direction: "sendrecv" })
      ];
      attachLocalTracks(entry);
    }

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) signal(peerId, "ice", { candidate: candidate.toJSON() });
    };

    pc.onnegotiationneeded = async () => {
      try {
        entry.makingOffer = true;
        await pc.setLocalDescription();
        signal(peerId, "offer", {
          sdp: { type: pc.localDescription.type, sdp: tuneOpus(pc.localDescription.sdp) }
        });
      } catch (e) {
        /* the other side re-offers if this drops */
      } finally {
        entry.makingOffer = false;
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") {
        try { pc.restartIce(); } catch (e) {}
      }
    };

    pc.onconnectionstatechange = () => {
      // Once the pipe is up, tell them what we are actually sending. The
      // answering side announces while answering; this covers the offering
      // side, so neither peer has to guess from an un-muted empty slot.
      if (pc.connectionState === "connected") announceMedia(peerId);
      emit("peerState", peerId, pc.connectionState);
    };

    pc.ontrack = ({ track, transceiver, streams }) => {
      if (track.kind === "audio") {
        emit("remoteAudio", peerId, entry.name, streams[0] || new MediaStream([track]));
        return;
      }

      const kind = slotOf(pc, transceiver) === SLOT_SCREEN ? "screen" : "cam";
      entry.remoteTracks[kind] = { track, stream: new MediaStream([track]) };

      const refresh = () => refreshRemoteVideo(peerId, entry, kind);
      track.onunmute = refresh;
      track.onmute = refresh;
      track.onended = refresh;
      refresh();
    };

    return entry;
  }

  /**
   * A slot's tile is shown only when the track is actually live *and* the peer
   * says that slot is on. Either signal alone lies: a slot is negotiated (and
   * so arrives via ontrack) long before anyone turns a camera on, and
   * replaceTrack(null) stops frames without muting the receiver.
   */
  function refreshRemoteVideo(peerId, entry, kind) {
    const held = entry.remoteTracks[kind];
    const live = held && !held.track.muted && held.track.readyState === "live";
    if (live && entry.remoteMedia[kind]) {
      emit("remoteVideo", peerId, entry.name, kind, held.stream);
    } else {
      emit("remoteVideoEnded", peerId, kind);
    }
  }

  function destroyPeer(peerId) {
    const entry = peers.get(peerId);
    if (!entry) return;
    try { entry.pc.close(); } catch (e) {}
    peers.delete(peerId);
    emit("peerGone", peerId);
  }

  /** Reconcile the mesh against the channel's presence list. */
  function syncPeers(list) {
    if (!active) return;
    const live = new Set();

    list.forEach(p => {
      if (!p.peerId || p.peerId === myPeerId) return;
      live.add(p.peerId);
      // Creating the peer adds its transceivers, which fires
      // onnegotiationneeded and starts the handshake on its own.
      const entry = createPeer(p.peerId, p.username || "Guest");
      if (p.username) entry.name = p.username;
    });

    peers.forEach((_, peerId) => { if (!live.has(peerId)) destroyPeer(peerId); });
  }

  // -- Signalling (perfect negotiation) --------------------------------------

  async function handleSignal(event, payload) {
    const peerId = payload.from;
    if (!peerId || !active) return;

    if (event === "bye") {
      destroyPeer(peerId);
      return;
    }

    const entry = peers.get(peerId) || createPeer(peerId, payload.name || "Guest");
    const pc = entry.pc;

    try {
      if (event === "offer" || event === "answer") {
        const description = payload.sdp;
        const offerCollision = description.type === "offer" &&
          (entry.makingOffer || pc.signalingState !== "stable");

        entry.ignoreOffer = !entry.polite && offerCollision;
        if (entry.ignoreOffer) return;

        await pc.setRemoteDescription(description);
        if (description.type === "offer") {
          // Transceivers created by an incoming offer start out `recvonly`,
          // which would answer "I will only listen" and silently drop
          // everything we later replaceTrack() onto them. Claim the offer's
          // slots as our own send slots *before* building the answer, so the
          // call is two-way from the very first exchange.
          const negotiated = negotiatedTransceivers(pc);
          if (negotiated.length >= 3) {
            entry.transceivers = negotiated.slice(0, 3);
            entry.transceivers.forEach(t => {
              try { t.direction = "sendrecv"; } catch (e) {}
            });
            attachLocalTracks(entry);
          }

          await pc.setLocalDescription();
          announceMedia(peerId);
          signal(peerId, "answer", {
            sdp: { type: pc.localDescription.type, sdp: tuneOpus(pc.localDescription.sdp) }
          });
        }
      } else if (event === "media") {
        // Authoritative "my camera/screen is on/off" notice -- see announceMedia.
        entry.remoteMedia = { cam: !!payload.cam, screen: !!payload.screen };
        refreshRemoteVideo(peerId, entry, "cam");
        refreshRemoteVideo(peerId, entry, "screen");
      } else if (event === "ice") {
        try {
          await pc.addIceCandidate(payload.candidate);
        } catch (e) {
          if (!entry.ignoreOffer) throw e;
        }
      }
    } catch (e) {
      console.warn("[Cielo VC] signalling error:", e);
    }
  }

  // -- Local media -----------------------------------------------------------

  /**
   * Transceivers that have been negotiated appear in m-line order, and only
   * one side ever creates m-lines, so position in that list *is* the slot on
   * both peers -- without depending on how a browser spells its mids.
   */
  function negotiatedTransceivers(pc) {
    return pc.getTransceivers().filter(t => t.mid !== null && t.mid !== undefined);
  }

  function slotOf(pc, transceiver) {
    return negotiatedTransceivers(pc).indexOf(transceiver);
  }

  /** Our three slots: the ones we created, or the ones the offer gave us. */
  function slotsFor(entry) {
    if (entry.transceivers.length) return entry.transceivers;
    const negotiated = negotiatedTransceivers(entry.pc);
    return negotiated.length >= 3 ? negotiated : [];
  }

  /** Puts every track we are currently sending onto its slot for one peer. */
  function attachLocalTracks(entry) {
    if (micStream) attachToSlot(entry, SLOT_AUDIO, micStream.getAudioTracks()[0]);
    if (camStream) attachToSlot(entry, SLOT_CAM, camStream.getVideoTracks()[0]);
    if (screenStream) attachToSlot(entry, SLOT_SCREEN, screenStream.getVideoTracks()[0]);
  }

  function attachToSlot(entry, slot, track) {
    const transceiver = slotsFor(entry)[slot];
    const sender = transceiver && transceiver.sender;
    if (!sender) return;
    sender.replaceTrack(track || null);
    if (track && slot === SLOT_CAM) capBitrate(sender, CAM_MAX_BITRATE, "maintain-framerate");
    if (track && slot === SLOT_SCREEN) capBitrate(sender, SCREEN_MAX_BITRATE, "maintain-resolution");
  }

  function broadcastTrack(slot, track) {
    peers.forEach(entry => attachToSlot(entry, slot, track));
  }

  /**
   * Tell peers which video slots are live.
   *
   * Turning a slot off is `replaceTrack(null)`, which browsers do not reliably
   * surface to the far side as a track `mute` (nothing is renegotiated, the
   * frames simply stop) -- so a stale tile would sit there frozen forever.
   * This is one tiny message on a websocket that is already open, and it makes
   * the "their camera went off" moment explicit rather than inferred.
   */
  function announceMedia(to) {
    const state = { cam: !!camStream, screen: !!screenStream };
    if (to) signal(to, "media", state);
    else peers.forEach((_, peerId) => signal(peerId, "media", state));
  }

  /** Drives the "who is talking" ring without shipping any extra signalling. */
  function startSpeakingMeter() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioCtx();
      const source = audioCtx.createMediaStreamSource(micStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let wasSpeaking = false;

      const tick = () => {
        if (!active) return;
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const speaking = !muted && (sum / data.length) > 15;
        if (speaking !== wasSpeaking) {
          wasSpeaking = speaking;
          emit("speaking", myPeerId, speaking);
        }
        speakingRaf = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {}
  }

  async function join() {
    if (active) return;
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
      },
      video: false
    });
    active = true;

    const micTrack = micStream.getAudioTracks()[0];
    if (micTrack) micTrack.contentHint = "speech";

    broadcastTrack(SLOT_AUDIO, micTrack);
    startSpeakingMeter();
    channel.track({ peerId: myPeerId, username, joinedAt: Date.now() });
    syncPeers(channel.listPresence());
    emit("joined");
  }

  function leave() {
    if (!active) return;
    active = false;
    peers.forEach((_, peerId) => signal(peerId, "bye", {}));
    peers.forEach(entry => { try { entry.pc.close(); } catch (e) {} });
    peers.clear();

    [micStream, camStream, screenStream].forEach(s => {
      if (s) s.getTracks().forEach(t => t.stop());
    });
    micStream = camStream = screenStream = null;

    cancelAnimationFrame(speakingRaf);
    if (audioCtx) {
      try { audioCtx.close(); } catch (e) {}
      audioCtx = null;
    }

    muted = false;
    channel.untrack();
    emit("left");
  }

  function setMuted(next) {
    muted = next;
    if (micStream) micStream.getAudioTracks().forEach(t => { t.enabled = !muted; });
    return muted;
  }

  async function setCamera(on) {
    if (!active) return false;
    if (on && !camStream) {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 } },
        audio: false
      });
      const track = camStream.getVideoTracks()[0];
      track.contentHint = "motion";
      broadcastTrack(SLOT_CAM, track);
      announceMedia();
      emit("localVideo", "cam", camStream);
      return true;
    }
    if (!on && camStream) {
      broadcastTrack(SLOT_CAM, null);
      camStream.getTracks().forEach(t => t.stop());
      camStream = null;
      announceMedia();
      emit("localVideoEnded", "cam");
      return false;
    }
    return !!camStream;
  }

  async function setScreenShare(on) {
    if (!active) return false;
    if (on && !screenStream) {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: false
      });
      const track = screenStream.getVideoTracks()[0];
      track.contentHint = "detail";
      // Stopping the share from the browser's own bar has to unwind our state too.
      track.onended = () => {
        setScreenShare(false);
        emit("screenShareEnded");
      };
      broadcastTrack(SLOT_SCREEN, track);
      announceMedia();
      emit("localVideo", "screen", screenStream);
      return true;
    }
    if (!on && screenStream) {
      broadcastTrack(SLOT_SCREEN, null);
      screenStream.getTracks().forEach(t => t.stop());
      screenStream = null;
      announceMedia();
      emit("localVideoEnded", "screen");
      return false;
    }
    return !!screenStream;
  }

  function destroy() {
    leave();
    channel.close();
  }

  return {
    myPeerId,
    join,
    leave,
    destroy,
    setMuted,
    setCamera,
    setScreenShare,
    get isActive() { return active; },
    get isMuted() { return muted; },
    get isCamOn() { return !!camStream; },
    get isSharing() { return !!screenStream; }
  };
}
