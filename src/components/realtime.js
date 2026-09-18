/**
 * Minimal Supabase Realtime (Phoenix) websocket client.
 *
 * The HUD deliberately ships no supabase-js -- every other feature talks to
 * PostgREST over plain fetch. Voice chat, though, needs a *push* transport:
 * WebRTC signalling over the 1.5s REST poll the chat uses would add up to
 * 1.5s of handshake latency per peer per step (offer -> answer -> ICE), which
 * is several seconds before you hear anyone. Realtime's broadcast channel is
 * a websocket already paid for by the Supabase project, so signalling lands
 * in ~10-30ms instead.
 *
 * This is just the slice of the protocol we need: join a channel, track
 * presence, send/receive broadcasts, heartbeat, and reconnect with backoff.
 * Protocol reference: https://supabase.com/docs/guides/realtime/protocol
 */

const HEARTBEAT_MS = 20000; // server times out at 25s
const MAX_BACKOFF_MS = 10000;

export function createRealtimeChannel({ supabaseUrl, supabaseKey, topic, presenceKey, onBroadcast, onPresence, onStatus }) {
  const wsUrl = supabaseUrl.replace(/^http/, "ws").replace(/\/+$/, "") +
    `/realtime/v1/websocket?apikey=${encodeURIComponent(supabaseKey)}&vsn=1.0.0`;
  const fullTopic = `realtime:${topic}`;

  let ws = null;
  let refCounter = 0;
  let heartbeatTimer = null;
  let reconnectTimer = null;
  let attempts = 0;
  let joined = false;
  let closedByUs = false;
  let presenceState = {};
  let trackedPayload = null;
  // Broadcasts attempted before the join completes (e.g. an ICE candidate
  // generated while the socket is still handshaking) would otherwise be
  // dropped silently and stall that peer connection -- queue them instead.
  let pending = [];

  const nextRef = () => String(++refCounter);

  function raw(event, payload, topicOverride) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify({ topic: topicOverride || fullTopic, event, payload: payload || {}, ref: nextRef() }));
    return true;
  }

  /** Fan a payload out to everyone else on the channel (or one peer via `to`). */
  function broadcast(event, payload) {
    const send = () => raw("broadcast", { type: "broadcast", event, payload });
    if (!joined || !send()) pending.push({ event, payload });
  }

  function flushPending() {
    const queued = pending;
    pending = [];
    queued.forEach(m => broadcast(m.event, m.payload));
  }

  /** Announce (or update) our own presence metadata on the channel. */
  function track(payload) {
    trackedPayload = payload;
    if (joined) raw("presence", { type: "presence", event: "track", payload });
  }

  function untrack() {
    trackedPayload = null;
    if (joined) raw("presence", { type: "presence", event: "untrack", payload: {} });
  }

  /** Flattened presence: [{ key, ...meta }] -- one entry per connected client. */
  function listPresence() {
    return Object.entries(presenceState).map(([key, v]) => {
      const meta = (v && v.metas && v.metas[0]) || {};
      return { key, ...meta };
    });
  }

  function applyDiff(diff) {
    Object.entries(diff.joins || {}).forEach(([k, v]) => { presenceState[k] = v; });
    Object.keys(diff.leaves || {}).forEach(k => { delete presenceState[k]; });
  }

  function handleMessage(msg) {
    if (msg.topic !== fullTopic && msg.topic !== "phoenix") return;

    switch (msg.event) {
      case "phx_reply":
        if (msg.payload && msg.payload.status === "ok" && !joined && msg.topic === fullTopic) {
          joined = true;
          attempts = 0;
          if (trackedPayload) raw("presence", { type: "presence", event: "track", payload: trackedPayload });
          flushPending();
          if (onStatus) onStatus("joined");
        }
        break;
      case "presence_state":
        presenceState = msg.payload || {};
        if (onPresence) onPresence(listPresence());
        break;
      case "presence_diff":
        applyDiff(msg.payload || {});
        if (onPresence) onPresence(listPresence());
        break;
      case "broadcast": {
        const p = msg.payload || {};
        if (onBroadcast) onBroadcast(p.event, p.payload);
        break;
      }
      case "phx_error":
      case "phx_close":
        joined = false;
        break;
    }
  }

  function connect() {
    closedByUs = false;
    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      raw("phx_join", {
        config: {
          broadcast: { self: false, ack: false },
          // `enabled` is what makes the server send the current roster
          // (`presence_state`) on join. Without it we only ever get
          // `presence_diff`, so whoever joins last sees an empty room --
          // they never hear about anyone who arrived before them.
          presence: { enabled: true, key: presenceKey },
          postgres_changes: []
        }
      });
      heartbeatTimer = setInterval(() => raw("heartbeat", {}, "phoenix"), HEARTBEAT_MS);
    };

    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch (err) { return; }
      handleMessage(msg);
    };

    ws.onerror = () => { if (onStatus) onStatus("error"); };

    ws.onclose = () => {
      joined = false;
      presenceState = {};
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      if (onStatus) onStatus("closed");
      if (!closedByUs) scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    const delay = Math.min(MAX_BACKOFF_MS, 500 * Math.pow(2, attempts++));
    reconnectTimer = setTimeout(connect, delay);
  }

  function close() {
    closedByUs = true;
    clearTimeout(reconnectTimer);
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    pending = [];
    if (ws && ws.readyState === WebSocket.OPEN) {
      untrack();
      raw("phx_leave", {});
    }
    try { if (ws) ws.close(); } catch (e) {}
    ws = null;
    joined = false;
    presenceState = {};
  }

  connect();

  return { broadcast, track, untrack, listPresence, close, get isJoined() { return joined; } };
}
