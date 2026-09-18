import { createPanel } from './panel.js';
import { ICONS } from './icons.js';
import { lgStore } from './storage.js';
import { getEmbeddedUsername, buildPersonalBookmarklet } from './identity.js';
import { createVoiceSession } from './voice.js';
import { createRealtimeChannel } from './realtime.js';
import { openVoiceWindow, createVideoStage } from './voiceWindow.js';

const DEFAULT_SUPABASE_URL = "https://mtusdkooiuoocyffsznx.supabase.co";
const DEFAULT_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10dXNka29vaXVvb2N5ZmZzem54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MzU4NDEsImV4cCI6MjA5NDIxMTg0MX0.b9zhiqVqykppmthj36LgMr_tbitnht3YkRyT69gkS9E";

const CHANNELS = [
  { id: "general", name: "general", icon: "#" },
  { id: "gaming", name: "gaming", icon: "🎮" },
  { id: "unblocked-links", name: "unblocked-links", icon: "🔗" },
  { id: "media", name: "media-share", icon: "📸" },
  { id: "ai", name: "ai-lounge", icon: "✨" }
];

// A DM is just a channel whose id is derived from both usernames, so the two
// participants always compute the same id and it needs no extra table. The
// names are percent-encoded before joining, so a separator character inside a
// username cannot make two different pairs collide.
function dmChannelId(a, b) {
  return "dm:" + [a, b].sort().map(encodeURIComponent).join("|");
}

function stringToColor(str) {
  const colors = ["#5ee7ff", "#8b7cf6", "#ffb3e6", "#ffd58a", "#8bffb0", "#38bdf8", "#ec4899", "#f59e0b"];
  let hash = 0;
  for (let i = 0; i < (str || "").length; i++) hash += str.charCodeAt(i);
  return colors[Math.abs(hash) % colors.length];
}

export function buildChat(root, vw, vh, onRemove) {
  // Supabase project is fixed for this HUD — not user-configurable.
  const supabaseUrl = DEFAULT_SUPABASE_URL;
  const supabaseKey = DEFAULT_SUPABASE_KEY;
  // ONE account per bookmarklet install, working on every site: if this
  // bundle was loaded from a personal bookmarklet link (one generated via
  // the "Save this account" button below), the username is embedded right
  // in that link's URL -- no storage of any kind involved, so it survives
  // even pages that sandbox out localStorage entirely. Otherwise fall back
  // to the plain per-site identity (and offer to upgrade it below).
  let myUsername = getEmbeddedUsername() || lgStore("_lg_hud_username");
  if (!myUsername) {
    myUsername = "User_" + Math.floor(1000 + Math.random() * 9000);
  }
  lgStore("_lg_hud_username", myUsername);
  const hasPermanentAccount = !!getEmbeddedUsername();

  let activeTarget = { type: "channel", id: "general", name: "general" };
  // Open DM conversations, by username. Persisted so they survive a reopen.
  let openDms = [];
  try {
    const saved = lgStore("_lg_hud_dms");
    if (saved) openDms = JSON.parse(saved).filter(n => n && n !== myUsername);
  } catch (e) { openDms = []; }
  let onlineUsers = [];
  let liveMessages = [];
  let pendingImage = null;

  // Voice chat state. The call itself lives in voice.js (mesh WebRTC over
  // Supabase Realtime); this panel only owns the UI around it.
  const VOICE_ROOM = "general";
  let voice = null;
  let inVoice = false;
  let voiceMembers = [];
  let videoWindow = null;   // the popped-out call window, when open
  let inlineStage = null;   // fallback grid, used when a popup is blocked
  const remoteAudioEls = new Map(); // peerId -> <audio>, always in this page

  const p = createPanel(root, {
    key: "chat",
    x: Math.max(20, Math.floor(vw * 0.16)),
    y: 100,
    width: Math.min(820, Math.max(520, Math.floor(vw * 0.72))),
    height: Math.min(600, Math.max(420, Math.floor(vh * 0.7))),
    title: "Chat",
    body: `
      <div class="lg-chat-container">
        <!-- Left Sidebar: Channels, Voice -->
        <div class="lg-chat-sidebar">
          <div class="lg-chat-sidebar-section">
            <div class="lg-chat-section-header">TEXT CHANNELS</div>
            <div class="lg-chat-channels-list" data-channels-list></div>
          </div>

          <div class="lg-chat-sidebar-section">
            <div class="lg-chat-section-header">DIRECT MESSAGES</div>
            <div class="lg-chat-dm-list" data-dm-list></div>
            <div class="lg-chat-dm-hint" data-dm-hint>Click anyone's name to start a DM.</div>
          </div>

          <!-- Voice Channel Section -->
          <div class="lg-chat-sidebar-section lg-voice-section">
            <div class="lg-chat-section-header">VOICE CHANNELS</div>
            <button class="lg-voice-channel-btn" data-btn="toggle-vc">
              <span class="lg-vc-icon">🔊</span>
              <span class="lg-vc-name">General Voice</span>
              <span class="lg-vc-badge" data-vc-badge>Join</span>
            </button>
            <div class="lg-vc-members" data-vc-members style="display:none;"></div>
          </div>

          <!-- User Bar -->
          <div class="lg-chat-user-bar">
            <div class="lg-chat-user-avatar" data-my-avatar style="background:${stringToColor(myUsername)};">${myUsername.charAt(0).toUpperCase()}</div>
            <div class="lg-chat-user-info">
              <div class="lg-chat-user-name" data-my-name>${escapeHtml(myUsername)}</div>
              <div class="lg-chat-user-status" data-sync-badge>
                <span class="lg-sync-dot online"></span>
                <span>Supabase Live</span>
              </div>
            </div>
            <button class="lg-chat-icon-btn" data-btn="open-settings" title="Account & Supabase Settings">${ICONS.gear}</button>
          </div>
        </div>

        <!-- Main Chat Area -->
        <div class="lg-chat-main">
          <!-- Header -->
          <div class="lg-chat-header">
            <div class="lg-chat-header-info">
              <span class="lg-chat-header-icon" data-header-icon>#</span>
              <span class="lg-chat-header-title" data-header-title>general</span>
            </div>
            <div class="lg-chat-header-actions">
              <div class="lg-chat-online" data-online-wrap>
                <button class="lg-chat-online-pill" data-online-pill title="People online">
                  <span class="lg-online-dot"></span>
                  <span data-online-count>0</span>
                </button>
                <div class="lg-chat-online-pop" data-online-pop></div>
              </div>
              <button class="lg-chat-header-btn" data-btn="refresh-msgs" title="Refresh Messages">↻</button>
            </div>
          </div>

          <!-- Live Voice Bar (visible when connected to VC) -->
          <div class="lg-chat-voice-bar" data-voice-bar style="display:none;">
            <div class="lg-vb-left">
              <span class="lg-vb-dot"></span>
              <div class="lg-vb-info">
                <div class="lg-vb-title">Voice Connected / General</div>
                <div class="lg-vb-sub" data-vb-mic-status>RTC Active · Low Latency</div>
              </div>
            </div>
            <div class="lg-vb-controls">
              <button class="lg-vb-btn" data-btn="vc-mute">🎤 Mute</button>
              <button class="lg-vb-btn" data-btn="vc-cam">📷 Cam</button>
              <button class="lg-vb-btn" data-btn="vc-share">🖥 Share</button>
              <button class="lg-vb-btn" data-btn="vc-window" title="Pop the video grid out into its own window">🗗 Video</button>
              <button class="lg-vb-btn disconnect" data-btn="vc-leave">📞 Leave</button>
            </div>
          </div>

          <!-- Fallback video grid, only used when the pop-out window is blocked -->
          <div class="lg-chat-inline-stage" data-vc-stage style="display:none;"></div>

          <!-- Remote call audio. Stays in this page (not the video window) so
               a plain voice call needs no second window at all. -->
          <div data-vc-audio style="display:none;"></div>

          <!-- Settings Drawer -->
          <div class="lg-chat-settings-drawer" data-settings-drawer style="display:none;">
            <div class="lg-chat-settings-title">⚡ Cielo Account</div>
            <div class="lg-chat-settings-grid">
              <label style="grid-column: span 2;">Your Username / Alias:
                <input type="text" data-cfg-username value="${escapeHtml(myUsername)}" placeholder="e.g. Alex" />
              </label>
            </div>
            <div style="font-size:11px;color:#94a3b8;margin-top:6px;">Renaming migrates all of your previous messages to the new name.</div>
            <div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end;">
              <button class="lg-chat-settings-save" data-btn="save-settings">Save &amp; Sync</button>
              <button class="lg-chat-settings-close" data-btn="close-settings">Close</button>
            </div>
            <div class="lg-chat-settings-permalink" style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.08);">
              <div style="font-size:12px;color:${hasPermanentAccount ? '#8bffb0' : '#ffd58a'};">
                ${hasPermanentAccount
                  ? `✓ This bookmarklet is saved to your account — it stays <strong>${escapeHtml(myUsername)}</strong> on every site.`
                  : `This site's copy of Cielo isn't saved — reopening on a different site currently starts a new local identity.`}
              </div>
              <div style="display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap;">
                <a class="lg-chat-settings-save" data-permalink-link href="#" style="text-decoration:none;display:inline-block;">⬇ ${hasPermanentAccount ? 'Update bookmarklet' : 'Drag to bookmarks bar'}</a>
                <span style="font-size:11px;color:#94a3b8;">Drag this to your bookmarks bar once (replacing your old one if renaming) — it keeps the username above on every site, forever, no login needed.</span>
              </div>
            </div>
          </div>

          <!-- Messages Stream -->
          <div class="lg-chat-stream" data-chat-stream>
            <div class="lg-chat-empty">Loading live messages...</div>
          </div>

          <!-- Pending Image Preview Row -->
          <div class="lg-chat-img-preview-row" data-img-preview-row style="display:none;">
            <div class="lg-chat-preview-wrap">
              <img data-preview-img src="" alt="Preview" />
              <button class="lg-chat-preview-remove" data-btn="remove-preview">×</button>
            </div>
            <span style="font-size:11px;color:#94a3b8;">Image attached. Press Send to post.</span>
          </div>

          <!-- Composer Bar -->
          <div class="lg-chat-composer">
            <div class="lg-chat-composer-wrap">
              <input type="text" class="lg-chat-input" data-chat-input placeholder="Message #${activeTarget.name}..." />
              <input type="file" accept="image/*" data-file-input style="display:none;" />
              <div class="lg-chat-composer-tools">
                <button class="lg-chat-tool-btn" data-btn="attach-image" title="Attach / Upload Image">🖼️</button>
                <button class="lg-chat-tool-btn" data-btn="quick-emoji" title="Add Emoji">😊</button>
                <button class="lg-chat-send-btn" data-btn="chat-send" title="Send">${ICONS.chat}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="lg-chat-user-menu" data-user-menu></div>
    `
  }, onRemove);

  // Element handles
  const channelsList = p.querySelector("[data-channels-list]");
  const dmList = p.querySelector("[data-dm-list]");
  const dmHint = p.querySelector("[data-dm-hint]");
  const onlineWrap = p.querySelector("[data-online-wrap]");
  const onlinePill = p.querySelector("[data-online-pill]");
  const onlineCountEl = p.querySelector("[data-online-count]");
  const onlinePop = p.querySelector("[data-online-pop]");
  const userMenu = p.querySelector("[data-user-menu]");
  const stream = p.querySelector("[data-chat-stream]");
  const input = p.querySelector("[data-chat-input]");
  const fileInput = p.querySelector("[data-file-input]");
  const attachImageBtn = p.querySelector("[data-btn='attach-image']");
  const imgPreviewRow = p.querySelector("[data-img-preview-row]");
  const previewImg = p.querySelector("[data-preview-img]");
  const removePreviewBtn = p.querySelector("[data-btn='remove-preview']");
  const sendBtn = p.querySelector("[data-btn='chat-send']");
  const quickEmojiBtn = p.querySelector("[data-btn='quick-emoji']");
  const headerIcon = p.querySelector("[data-header-icon]");
  const headerTitle = p.querySelector("[data-header-title]");
  const refreshBtn = p.querySelector("[data-btn='refresh-msgs']");
  const settingsBtn = p.querySelector("[data-btn='open-settings']");
  const settingsDrawer = p.querySelector("[data-settings-drawer]");
  const cfgUsername = p.querySelector("[data-cfg-username]");
  const saveSettingsBtn = p.querySelector("[data-btn='save-settings']");
  const closeSettingsBtn = p.querySelector("[data-btn='close-settings']");
  const myNameEl = p.querySelector("[data-my-name]");
  const myAvatarEl = p.querySelector("[data-my-avatar]");
  const permalinkEl = p.querySelector("[data-permalink-link]");

  function refreshPermalink() {
    if (permalinkEl) permalinkEl.href = buildPersonalBookmarklet(myUsername);
  }
  refreshPermalink();

  // VC handles
  const toggleVcBtn = p.querySelector("[data-btn='toggle-vc']");
  const vcBadge = p.querySelector("[data-vc-badge]");
  const vcMembersEl = p.querySelector("[data-vc-members]");
  const voiceBar = p.querySelector("[data-voice-bar]");
  const vcMuteBtn = p.querySelector("[data-btn='vc-mute']");
  const vcCamBtn = p.querySelector("[data-btn='vc-cam']");
  const vcShareBtn = p.querySelector("[data-btn='vc-share']");
  const vcWindowBtn = p.querySelector("[data-btn='vc-window']");
  const vcLeaveBtn = p.querySelector("[data-btn='vc-leave']");
  const vcMicStatus = p.querySelector("[data-vb-mic-status]");
  const vcStageEl = p.querySelector("[data-vc-stage]");
  const vcAudioEl = p.querySelector("[data-vc-audio]");

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/\u0027/g, "&#039;");
  }

  // Robust Message Body & Image Parser
  function renderMessageBody(rawText, imgField) {
    let images = [];
    if (imgField) images.push(imgField);

    let textContent = rawText || "";

    // Check if whole text is a data URL or image URL
    const trimmed = textContent.trim();
    if (trimmed.startsWith("data:image/")) {
      images.push(trimmed);
      textContent = "";
    } else if (/^https?:\/\/[^\s]+?\.(png|jpe?g|gif|webp|svg)(\?[^\s]*)?$/i.test(trimmed)) {
      images.push(trimmed);
      textContent = "";
    } else {
      // Find embedded image URLs in text
      const inlineImgRegex = /(https?:\/\/[^\s<]+?\.(?:png|jpe?g|gif|webp|svg)(\?[^\s<]*)?)/gi;
      textContent = textContent.replace(inlineImgRegex, (m) => {
        images.push(m);
        return "";
      }).trim();
    }

    // Format text and links
    let formattedText = "";
    if (textContent) {
      formattedText = escapeHtml(textContent).replace(/(https?:\/\/[^\s<]+)/gi, (url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="lg-chat-msg-link">${url}</a>`;
      });
    }

    // Format Images
    let imagesHtml = images.map(src => `
      <div class="lg-chat-img-card">
        <img src="${src}" class="lg-chat-img-thumb" loading="lazy" onclick="window.open('${src}', '_blank')" alt="Image" />
      </div>
    `).join("");

    return `
      ${formattedText ? `<div class="lg-chat-msg-text">${formattedText}</div>` : ''}
      ${imagesHtml}
    `;
  }

  // When someone renames themselves, re-point their entire history (channel
  // messages + presence row) at the new username so nothing they said before
  // the rename becomes orphaned or unattributed.
  async function migrateUsername(oldName, newName) {
    if (!oldName || !newName || oldName === newName) return;
    const base = supabaseUrl.replace(/\/+$/, '');
    const headers = {
      "apikey": supabaseKey,
      "Authorization": `Bearer ${supabaseKey}`,
      "Content-Type": "application/json"
    };

    try {
      // 1. Channel messages authored by the old name.
      const msgsRes = await fetch(`${base}/rest/v1/chat_messages?data->>name=eq.${encodeURIComponent(oldName)}`, { headers });
      if (msgsRes.ok) {
        const rows = await msgsRes.json();
        if (Array.isArray(rows)) {
          for (const row of rows) {
            const updatedData = { ...row.data, name: newName };
            await fetch(`${base}/rest/v1/chat_messages?id=eq.${row.id}`, {
              method: "PATCH",
              headers: { ...headers, "Prefer": "return=minimal" },
              body: JSON.stringify({ data: updatedData })
            });
          }
        }
      }

      // 2. Drop the old presence row (registerUser() will insert the new one).
      await fetch(`${base}/rest/v1/chat_users?username=eq.${encodeURIComponent(oldName)}`, {
        method: "DELETE",
        headers
      });
    } catch (e) {
      console.warn("[Liquid Chat] Username migration failed:", e);
    }
  }

  async function registerUser() {
    if (!supabaseUrl || !supabaseKey || !myUsername) return;
    try {
      await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/chat_users`, {
        method: "POST",
        headers: {
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates"
        },
        body: JSON.stringify({
          username: myUsername,
          data: {
            username: myUsername,
            last_seen: Date.now(),
            status: "online"
          }
        })
      });
    } catch (e) {}
  }

  function renderSidebar() {
    // Channels
    channelsList.innerHTML = "";
    CHANNELS.forEach(ch => {
      const btn = document.createElement("button");
      btn.className = `lg-chat-item ${activeTarget.type === 'channel' && activeTarget.id === ch.id ? 'active' : ''}`;
      btn.innerHTML = `<span class="lg-chat-item-icon">${ch.icon}</span><span class="lg-chat-item-name">${ch.name}</span>`;
      btn.addEventListener("click", () => {
        switchTarget("channel", ch.id, ch.name);
      });
      channelsList.appendChild(btn);
    });

    // Direct messages
    dmList.innerHTML = "";
    openDms.forEach(name => {
      const id = dmChannelId(myUsername, name);
      const row = document.createElement("div");
      row.className = `lg-chat-item lg-chat-dm-item ${activeTarget.type === 'dm' && activeTarget.id === id ? 'active' : ''}`;

      const open = document.createElement("button");
      open.className = "lg-chat-dm-open";
      open.innerHTML = `
        <span class="lg-chat-dm-avatar" style="background:${stringToColor(name)};">${escapeHtml(name.charAt(0).toUpperCase())}</span>
        <span class="lg-chat-item-name">${escapeHtml(name)}</span>
        <span class="lg-chat-dm-presence ${isOnline(name) ? 'online' : ''}"></span>
      `;
      open.addEventListener("click", () => openDm(name));

      const close = document.createElement("button");
      close.className = "lg-chat-dm-close";
      close.title = `Close DM with ${name}`;
      close.textContent = "×";
      close.addEventListener("click", (e) => {
        e.stopPropagation();
        closeDm(name);
      });

      row.appendChild(open);
      row.appendChild(close);
      dmList.appendChild(row);
    });

    dmHint.style.display = openDms.length ? "none" : "block";
  }

  function persistDms() {
    try { lgStore("_lg_hud_dms", JSON.stringify(openDms)); } catch (e) {}
  }

  /** Opens (creating if needed) the DM conversation with `name`. */
  function openDm(name) {
    if (!name || name === myUsername) return;
    if (openDms.indexOf(name) === -1) {
      openDms.unshift(name);
      persistDms();
    }
    switchTarget("dm", dmChannelId(myUsername, name), name);
  }

  function closeDm(name) {
    openDms = openDms.filter(n => n !== name);
    persistDms();
    // Closing the conversation you are reading would leave the stream showing
    // messages with no selected target, so fall back to #general.
    if (activeTarget.type === "dm" && activeTarget.id === dmChannelId(myUsername, name)) {
      switchTarget("channel", "general", "general");
    } else {
      renderSidebar();
    }
  }

  function switchTarget(type, id, name) {
    activeTarget = { type, id, name };
    const isDm = type === "dm";
    headerIcon.textContent = isDm ? "@" : "#";
    headerTitle.textContent = name;
    input.placeholder = isDm ? `Message @${name}...` : `Message #${name}...`;
    // Drop the previous conversation's messages so they can't flash in the
    // new one during the fetch.
    liveMessages = [];
    renderSidebar();
    fetchMessages();
  }

  // -- Who is online, and the click-a-user menu -----------------------------

  function isOnline(name) {
    return onlineUsers.indexOf(name) !== -1;
  }

  /**
   * Presence rides the same Realtime websocket the voice chat uses, rather
   * than the chat_users "last_seen" column polled on a timer: joining and
   * leaving show up immediately, and someone who closes the tab disappears on
   * the spot instead of lingering until a timeout expires.
   */
  const presenceChannel = createRealtimeChannel({
    supabaseUrl,
    supabaseKey,
    topic: "chat:online",
    presenceKey: myUsername,
    onPresence: (list) => {
      onlineUsers = list
        .map(u => u.username)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      renderOnline();
      renderSidebar();
    }
  });
  presenceChannel.track({ username: myUsername });

  function renderOnline() {
    onlineCountEl.textContent = String(onlineUsers.length);
    onlinePill.title = onlineUsers.length === 1
      ? "1 person online"
      : onlineUsers.length + " people online";

    onlinePop.innerHTML = "";
    const title = document.createElement("div");
    title.className = "lg-chat-online-pop-title";
    title.textContent = onlineUsers.length ? "ONLINE — " + onlineUsers.length : "NOBODY ONLINE";
    onlinePop.appendChild(title);

    onlineUsers.forEach(name => {
      const row = document.createElement("button");
      row.className = "lg-chat-online-row";
      row.innerHTML = `
        <span class="lg-chat-dm-avatar" style="background:${stringToColor(name)};">${escapeHtml(name.charAt(0).toUpperCase())}</span>
        <span class="lg-chat-online-name">${escapeHtml(name)}</span>
        ${name === myUsername ? '<span class="lg-chat-online-you">you</span>' : ''}
      `;
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        openUserMenu(name, e.clientX, e.clientY);
      });
      onlinePop.appendChild(row);
    });
  }

  let onlinePopPinned = false;
  onlineWrap.addEventListener("mouseenter", () => onlinePop.classList.add("visible"));
  onlineWrap.addEventListener("mouseleave", () => {
    if (!onlinePopPinned) onlinePop.classList.remove("visible");
  });
  // Hovering does nothing on a touchscreen, so the pill also pins the list.
  onlinePill.addEventListener("click", (e) => {
    e.stopPropagation();
    onlinePopPinned = !onlinePopPinned;
    onlinePop.classList.toggle("visible", onlinePopPinned);
  });

  /** The "what do you want to do with this person" menu. */
  function openUserMenu(name, x, y) {
    if (!name) return;
    userMenu.innerHTML = "";

    const head = document.createElement("div");
    head.className = "lg-chat-user-menu-head";
    head.innerHTML = `
      <span class="lg-chat-dm-avatar" style="background:${stringToColor(name)};">${escapeHtml(name.charAt(0).toUpperCase())}</span>
      <span class="lg-chat-user-menu-name">${escapeHtml(name)}</span>
      <span class="lg-chat-dm-presence ${isOnline(name) ? 'online' : ''}"></span>
    `;
    userMenu.appendChild(head);

    const addItem = (label, onClick, disabled) => {
      const b = document.createElement("button");
      b.className = "lg-chat-user-menu-item";
      b.textContent = label;
      if (disabled) {
        b.disabled = true;
      } else {
        b.addEventListener("click", () => { closeUserMenu(); onClick(); });
      }
      userMenu.appendChild(b);
    };

    if (name === myUsername) {
      addItem("That's you", null, true);
    } else {
      addItem("💬 Message @" + name, () => openDm(name));
      addItem("📋 Copy username", () => {
        try { navigator.clipboard.writeText(name); } catch (e) {}
      });
    }

    // Positioned in viewport coordinates, then nudged back inside if it would
    // overhang the right or bottom edge.
    userMenu.classList.add("visible");
    const rect = userMenu.getBoundingClientRect();
    userMenu.style.left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)) + "px";
    userMenu.style.top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)) + "px";
  }

  function closeUserMenu() {
    userMenu.classList.remove("visible");
  }

  /** Opens the menu for whoever authored the message that was clicked. */
  function onAuthorClick(e, name) {
    e.stopPropagation();
    openUserMenu(name, e.clientX, e.clientY);
  }

  // Any click outside the menu (or the online list) dismisses them. Capture
  // phase, and composedPath() so it still works from inside the shadow root.
  const onDocClick = (e) => {
    const path = e.composedPath ? e.composedPath() : [];
    if (path.indexOf(userMenu) === -1) closeUserMenu();
    if (path.indexOf(onlineWrap) === -1) {
      onlinePopPinned = false;
      onlinePop.classList.remove("visible");
    }
  };
  document.addEventListener("click", onDocClick, true);

  /** Channels and DMs are both just conversations backed by chat_messages. */
  function isConversation() {
    return activeTarget.type === "channel" || activeTarget.type === "dm";
  }

  async function fetchMessages() {
    try {
      if (isConversation()) {
        const endpoint = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/chat_messages?order=id.desc&limit=70`;
        const res = await fetch(endpoint, {
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`
          }
        });

        if (res.ok) {
          const rows = await res.json();
          if (Array.isArray(rows)) {
            const filtered = rows
              .filter(r => r.data && (r.data.channel === activeTarget.id || (!r.data.channel && activeTarget.id === "general")))
              .reverse()
              .map(r => ({
                id: r.id,
                author: r.data.name || "Anonymous",
                text: r.data.text || "",
                image: r.data.image || r.data.img || null,
                time: r.data.ts ? new Date(r.data.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "now",
                me: r.data.name === myUsername,
                reactions: r.data.reactions || {},
                isBot: r.data.isBot || false
              }));
            liveMessages = filtered;
            renderMessages();
          }
        }
      }
    } catch (e) {
      console.warn("[Liquid Chat] Fetch error:", e);
    }
  }

  function renderMessages() {
    // Only auto-scroll to the bottom if the user was already near it —
    // otherwise a poll (every 1.5s) yanks them back down while reading history.
    const NEAR_BOTTOM_PX = 60;
    const wasNearBottom = stream.scrollHeight - stream.scrollTop - stream.clientHeight <= NEAR_BOTTOM_PX;

    stream.innerHTML = "";

    if (liveMessages.length === 0) {
      const empty = document.createElement("div");
      empty.className = "lg-chat-empty";
      empty.innerHTML = `
        <div style="font-size:24px;margin-bottom:6px;">💬</div>
        <div>No messages yet in <strong>${escapeHtml(activeTarget.name)}</strong></div>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px;">Type a message or share an image below!</div>
      `;
      stream.appendChild(empty);
      return;
    }

    liveMessages.forEach(msg => {
      const row = document.createElement("div");
      row.className = `lg-chat-msg-row ${msg.me ? 'me' : ''}`;

      const avatarColor = stringToColor(msg.author);
      const avatarLetter = (msg.author || "U").charAt(0).toUpperCase();

      const reactionsHtml = Object.entries(msg.reactions || {}).map(([emoji, count]) => `
        <button class="lg-chat-rxn-pill" data-rxn="${emoji}">
          <span>${emoji}</span>
          <span class="count">${count}</span>
        </button>
      `).join("");

      row.innerHTML = `
        <div class="lg-chat-msg-avatar lg-clickable-user" style="background:${msg.isBot ? '#ec4899' : avatarColor};">${avatarLetter}</div>
        <div class="lg-chat-msg-content">
          <div class="lg-chat-msg-meta">
            <span class="lg-chat-msg-author lg-clickable-user">${escapeHtml(msg.author)}</span>
            ${msg.isBot ? '<span class="lg-chat-bot-tag">AI</span>' : ''}
            <span class="lg-chat-msg-time">${escapeHtml(msg.time)}</span>
          </div>
          <div class="lg-chat-msg-bubble">${renderMessageBody(msg.text, msg.image)}</div>
          <div class="lg-chat-msg-reactions" data-rxn-wrap>
            ${reactionsHtml}
            <button class="lg-chat-rxn-add" title="Add reaction">+</button>
          </div>
        </div>
      `;

      // Clicking whoever sent a message is the way into a DM with them.
      if (!msg.isBot && msg.author !== myUsername) {
        row.querySelectorAll(".lg-clickable-user").forEach(elm => {
          elm.addEventListener("click", (e) => onAuthorClick(e, msg.author));
        });
      }

      const addRxnBtn = row.querySelector(".lg-chat-rxn-add");
      if (addRxnBtn) {
        addRxnBtn.addEventListener("click", () => {
          const emoji = prompt("Enter reaction emoji (e.g. 👍, ❤️, 🔥, 🚀, 💀, 💎):", "🔥");
          if (emoji) addReaction(msg.id, emoji.trim());
        });
      }

      stream.appendChild(row);
    });

    if (wasNearBottom) {
      stream.scrollTop = stream.scrollHeight;
    }
  }

  async function addReaction(msgId, emoji) {
    const msg = liveMessages.find(m => m.id === msgId);
    if (!msg) return;
    if (!msg.reactions) msg.reactions = {};
    msg.reactions[emoji] = (msg.reactions[emoji] || 0) + 1;
    renderMessages();

    // Persist so the reaction survives the next poll instead of being
    // overwritten by the server's (until-now unchanged) copy.
    const base = supabaseUrl.replace(/\/+$/, '');
    const headers = {
      "apikey": supabaseKey,
      "Authorization": `Bearer ${supabaseKey}`,
      "Content-Type": "application/json"
    };

    try {
      if (isConversation() && typeof msgId === "number") {
        const res = await fetch(`${base}/rest/v1/chat_messages?id=eq.${msgId}`, { headers });
        if (res.ok) {
          const rows = await res.json();
          if (rows[0]) {
            const updatedData = { ...rows[0].data, reactions: msg.reactions };
            await fetch(`${base}/rest/v1/chat_messages?id=eq.${msgId}`, {
              method: "PATCH",
              headers: { ...headers, "Prefer": "return=minimal" },
              body: JSON.stringify({ data: updatedData })
            });
          }
        }
      }
      // Optimistic/bot messages (opt_*, bot_*) have no DB row yet — the local
      // reaction still shows, it just won't survive a poll until they land.
    } catch (e) {
      console.warn("[Liquid Chat] Reaction sync failed:", e);
    }
  }

  async function sendMessage() {
    const text = input.value.trim();
    const imageToSend = pendingImage;

    if (!text && !imageToSend) return;

    input.value = "";
    clearPendingImage();

    const timestamp = Date.now();
    const optimisticMsg = {
      id: "opt_" + timestamp,
      author: myUsername,
      text: text,
      image: imageToSend,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      me: true,
      reactions: {}
    };

    liveMessages.push(optimisticMsg);
    renderMessages();

    if (isConversation()) {
      const payload = {
        data: {
          id: `${timestamp}-${Math.random().toString(36).substring(2, 8)}`,
          ts: timestamp,
          name: myUsername,
          text: text,
          image: imageToSend,
          channel: activeTarget.id,
          reactions: {}
        }
      };

      try {
        await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/chat_messages`, {
          method: "POST",
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
          },
          body: JSON.stringify(payload)
        });
        setTimeout(fetchMessages, 200);
      } catch (e) {
        console.error("[Liquid Chat] Send error:", e);
      }

      // Cielo AI Assistant Response
      if (activeTarget.id === "ai" || text.startsWith("/ai ")) {
        const query = text.startsWith("/ai ") ? text.replace("/ai ", "") : text;
        setTimeout(() => {
          const botReply = {
            id: "bot_" + Date.now(),
            author: "Cielo AI",
            text: getAiReply(query),
            image: null,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            me: false,
            isBot: true,
            reactions: { "✨": 1 }
          };
          liveMessages.push(botReply);
          renderMessages();
        }, 600);
      }
    }
  }

  function getAiReply(q) {
    const l = q.toLowerCase();
    if (l.includes("proxy") || l.includes("scramjet") || l.includes("games")) {
      return "The Liquid Glass Browser has a Scramjet Proxy mode — point it at your own Scramjet server to bypass web filters. Open the Browser widget to try it!";
    }
    if (l.includes("supa") || l.includes("database") || l.includes("table")) {
      return `Connected to live Supabase DB (${supabaseUrl}). Messages and images are synchronized in real-time!`;
    }
    return `Cielo AI: Got your message "${q}". Live cloud rooms & voice chat are ready!`;
  }

  function setPendingImage(dataUrl) {
    pendingImage = dataUrl;
    previewImg.src = dataUrl;
    imgPreviewRow.style.display = "flex";
  }

  function clearPendingImage() {
    pendingImage = null;
    previewImg.src = "";
    imgPreviewRow.style.display = "none";
    fileInput.value = "";
  }

  // Image Attach Handlers
  attachImageBtn.addEventListener("click", () => {
    const choice = confirm("Click OK to choose an image from your computer, or Cancel to enter an image URL.");
    if (choice) {
      fileInput.click();
    } else {
      const url = prompt("Enter direct image URL (e.g. https://.../pic.png):");
      if (url && url.trim()) {
        setPendingImage(url.trim());
      }
    }
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      alert("Image is too large! Please select an image under 3MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setPendingImage(e.target.result);
    };
    reader.readAsDataURL(file);
  });

  removePreviewBtn.addEventListener("click", clearPendingImage);

  // ── Voice Chat ────────────────────────────────────────────────────────────
  // Real mesh WebRTC (see voice.js). Audio plays here in the page; video tiles
  // are rendered in a separate pop-out window, falling back to an inline grid
  // only if the browser blocks the popup.

  function tileId(peerId, kind) {
    return peerId + ":" + kind;
  }

  /** The stage currently showing video, if any. */
  function activeStage() {
    if (videoWindow && videoWindow.isOpen) return videoWindow.stage;
    return inlineStage;
  }

  function stageState() {
    return {
      muted: voice ? voice.isMuted : false,
      cam: voice ? voice.isCamOn : false,
      share: voice ? voice.isSharing : false,
      status: voiceStatusText()
    };
  }

  function voiceStatusText() {
    if (!inVoice) return "Disconnected";
    const others = voiceMembers.filter(m => !m.me).length;
    return others === 0
      ? "Voice connected · waiting for others"
      : `Voice connected · ${others + 1} in call`;
  }

  function syncStageState() {
    const stage = activeStage();
    if (stage) stage.setState(stageState());
  }

  const stageActions = {
    onMute: () => toggleMute(),
    onCam: () => toggleCamera(),
    onShare: () => toggleScreenShare(),
    onLeave: () => leaveVoice()
  };

  /** Opens (or focuses) the pop-out call window; inline grid if blocked. */
  function openVideoStage(focusIt) {
    if (videoWindow && videoWindow.isOpen) {
      if (focusIt) videoWindow.focus();
      syncStageState();
      return activeStage();
    }

    videoWindow = openVoiceWindow({
      title: "Cielo Voice — " + VOICE_ROOM,
      actions: stageActions,
      onClosed: () => {
        // Closing the window drops video but keeps the call: cheapest state.
        videoWindow = null;
        if (inVoice && voice) {
          if (voice.isCamOn) voice.setCamera(false);
          if (voice.isSharing) voice.setScreenShare(false);
        }
        updateVoiceButtons();
      }
    });

    if (!videoWindow) {
      if (!inlineStage) {
        vcStageEl.style.display = "block";
        inlineStage = createVideoStage(document, vcStageEl, stageActions);
      }
    } else if (inlineStage) {
      closeInlineStage();
    }

    const stage = activeStage();
    if (stage) {
      // Re-attach every stream we already have to the (possibly new) stage.
      restoreTiles(stage);
      stage.setState(stageState());
    }
    updateVoiceButtons();
    return stage;
  }

  function closeInlineStage() {
    if (!inlineStage) return;
    inlineStage.destroy();
    inlineStage = null;
    vcStageEl.style.display = "none";
  }

  function closeVideoStage() {
    if (videoWindow) {
      videoWindow.close();
      videoWindow = null;
    }
    closeInlineStage();
    liveTiles.clear();
    updateVoiceButtons();
  }

  // Every stream currently on screen, so the stage can be rebuilt after the
  // window is reopened (or after falling back to the inline grid).
  const liveTiles = new Map(); // tileId -> { label, stream, opts }

  function showTile(id, label, stream, opts) {
    liveTiles.set(id, { label, stream, opts });
    const stage = activeStage() || openVideoStage(false);
    if (stage) stage.addTile(id, label, stream, opts);
  }

  function hideTile(id) {
    liveTiles.delete(id);
    const stage = activeStage();
    if (stage) stage.removeTile(id);
  }

  function restoreTiles(stage) {
    liveTiles.forEach((t, id) => stage.addTile(id, t.label, t.stream, t.opts));
  }

  function attachRemoteAudio(peerId, stream) {
    let audio = remoteAudioEls.get(peerId);
    if (!audio) {
      audio = document.createElement("audio");
      audio.autoplay = true;
      audio.playsInline = true;
      vcAudioEl.appendChild(audio);
      remoteAudioEls.set(peerId, audio);
    }
    audio.srcObject = stream;
    audio.play().catch(() => {});
  }

  function dropRemoteAudio(peerId) {
    const audio = remoteAudioEls.get(peerId);
    if (!audio) return;
    audio.srcObject = null;
    audio.remove();
    remoteAudioEls.delete(peerId);
  }

  function renderVoiceMembers() {
    const list = voiceMembers.length ? voiceMembers : [{ peerId: "me", username: myUsername, me: true }];
    vcMembersEl.innerHTML = "";
    list.forEach(m => {
      const chip = document.createElement("div");
      chip.className = "lg-vc-chip" + (m.me ? " me" : "");
      chip.dataset.peer = m.peerId;
      chip.innerHTML = `
        <span class="lg-vc-dot"></span>
        <span class="lg-vc-name">${escapeHtml(m.username)}${m.me ? " (you)" : ""}</span>
      `;
      vcMembersEl.appendChild(chip);
    });
  }

  function updateVoiceButtons() {
    if (!voice) return;
    vcMuteBtn.textContent = voice.isMuted ? "🔇 Unmute" : "🎤 Mute";
    vcMuteBtn.classList.toggle("muted", voice.isMuted);

    vcCamBtn.textContent = voice.isCamOn ? "📷 Cam (On)" : "📷 Cam";
    vcCamBtn.classList.toggle("active", voice.isCamOn);

    vcShareBtn.textContent = voice.isSharing ? "🖥 Sharing" : "🖥 Share";
    vcShareBtn.classList.toggle("active", voice.isSharing);

    const stageOpen = !!activeStage();
    vcWindowBtn.textContent = stageOpen ? "🗗 Video ✓" : "🗗 Video";
    vcWindowBtn.classList.toggle("active", stageOpen);

    vcMicStatus.textContent = voice.isMuted ? "Microphone muted" : voiceStatusText();
    syncStageState();
  }

  function ensureVoiceSession() {
    if (voice) return voice;
    voice = createVoiceSession({
      supabaseUrl,
      supabaseKey,
      room: VOICE_ROOM,
      username: myUsername,
      handlers: {
        members: (members) => {
          voiceMembers = members;
          renderVoiceMembers();
          if (inVoice) updateVoiceButtons();
        },
        speaking: (peerId, speaking) => {
          const chip = vcMembersEl.querySelector(`.lg-vc-chip[data-peer="${peerId}"]`);
          if (chip) chip.classList.toggle("speaking", speaking);
        },
        remoteAudio: (peerId, name, stream) => attachRemoteAudio(peerId, stream),
        remoteVideo: (peerId, name, kind, stream) => {
          showTile(tileId(peerId, kind), (kind === "screen" ? "🖥 " : "") + name, stream, { screen: kind === "screen" });
        },
        remoteVideoEnded: (peerId, kind) => hideTile(tileId(peerId, kind)),
        peerGone: (peerId) => {
          dropRemoteAudio(peerId);
          hideTile(tileId(peerId, "cam"));
          hideTile(tileId(peerId, "screen"));
        },
        localVideo: (kind, stream) => {
          showTile(tileId("local", kind), (kind === "screen" ? "🖥 " : "") + myUsername + " (you)", stream, {
            screen: kind === "screen",
            mirror: kind === "cam"
          });
        },
        localVideoEnded: (kind) => hideTile(tileId("local", kind)),
        screenShareEnded: () => updateVoiceButtons()
      }
    });
    return voice;
  }

  async function joinVoice() {
    try {
      await ensureVoiceSession().join();
    } catch (err) {
      alert("Microphone access is required to join Voice Chat. Please allow microphone permissions in your browser.");
      return;
    }

    inVoice = true;
    voiceBar.style.display = "flex";
    toggleVcBtn.classList.add("in-voice");
    vcBadge.textContent = "Connected";
    vcBadge.className = "lg-vc-badge active";
    vcMembersEl.style.display = "flex";
    renderVoiceMembers();
    updateVoiceButtons();
  }

  function leaveVoice() {
    if (!inVoice) return;
    inVoice = false;
    if (voice) voice.leave();

    closeVideoStage();
    remoteAudioEls.forEach((_, peerId) => dropRemoteAudio(peerId));
    voiceMembers = [];

    voiceBar.style.display = "none";
    toggleVcBtn.classList.remove("in-voice");
    vcBadge.textContent = "Join";
    vcBadge.className = "lg-vc-badge";
    vcMembersEl.style.display = "none";
    vcMembersEl.innerHTML = "";
    vcMuteBtn.textContent = "🎤 Mute";
    vcMuteBtn.classList.remove("muted");
    vcCamBtn.textContent = "📷 Cam";
    vcCamBtn.classList.remove("active");
    vcShareBtn.textContent = "🖥 Share";
    vcShareBtn.classList.remove("active");
    vcWindowBtn.classList.remove("active");
  }

  function toggleMute() {
    if (!inVoice || !voice) return;
    voice.setMuted(!voice.isMuted);
    updateVoiceButtons();
  }

  async function toggleCamera() {
    if (!inVoice || !voice) return;
    const turningOn = !voice.isCamOn;
    // Open the stage first so the local preview has somewhere to land.
    if (turningOn) openVideoStage(true);
    try {
      await voice.setCamera(turningOn);
    } catch (e) {
      alert("Camera access denied.");
    }
    updateVoiceButtons();
  }

  async function toggleScreenShare() {
    if (!inVoice || !voice) return;
    const turningOn = !voice.isSharing;
    if (turningOn) openVideoStage(true);
    try {
      await voice.setScreenShare(turningOn);
    } catch (e) {
      // User dismissed the picker — nothing to report.
    }
    updateVoiceButtons();
  }

  toggleVcBtn.addEventListener("click", () => {
    if (inVoice) {
      leaveVoice();
    } else {
      joinVoice();
    }
  });

  vcLeaveBtn.addEventListener("click", leaveVoice);
  vcMuteBtn.addEventListener("click", toggleMute);
  vcCamBtn.addEventListener("click", toggleCamera);
  vcShareBtn.addEventListener("click", toggleScreenShare);

  vcWindowBtn.addEventListener("click", () => {
    if (!inVoice) return;
    if (activeStage()) {
      closeVideoStage();
      // Nothing left to render video into, so stop producing it.
      if (voice.isCamOn) voice.setCamera(false);
      if (voice.isSharing) voice.setScreenShare(false);
      updateVoiceButtons();
    } else {
      openVideoStage(true);
    }
  });

  quickEmojiBtn.addEventListener("click", () => {
    const emojis = ["🔥", "👍", "❤️", "🚀", "😂", "💀", "💎", "✨", "🎮"];
    const chosen = prompt(`Pick an emoji to insert:\n${emojis.join("  ")}`, "🔥");
    if (chosen) {
      input.value += (input.value ? " " : "") + chosen.trim();
      input.focus();
    }
  });

  sendBtn.addEventListener("click", () => sendMessage());
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") sendMessage();
  });

  refreshBtn.addEventListener("click", () => {
    fetchMessages();
  });

  settingsBtn.addEventListener("click", () => {
    const show = settingsDrawer.style.display === "none";
    settingsDrawer.style.display = show ? "block" : "none";
  });

  closeSettingsBtn.addEventListener("click", () => {
    settingsDrawer.style.display = "none";
  });

  saveSettingsBtn.addEventListener("click", async () => {
    const oldUsername = myUsername;
    const newUsername = cfgUsername.value.trim() || ("User_" + Math.floor(1000 + Math.random() * 9000));
    const renamed = newUsername !== oldUsername;

    myUsername = newUsername;
    lgStore("_lg_hud_username", myUsername);

    myNameEl.textContent = myUsername;
    myAvatarEl.textContent = myUsername.charAt(0).toUpperCase();
    myAvatarEl.style.background = stringToColor(myUsername);

    settingsDrawer.style.display = "none";

    if (renamed) {
      saveSettingsBtn.disabled = true;
      saveSettingsBtn.textContent = "Syncing…";
      await migrateUsername(oldUsername, newUsername);
      saveSettingsBtn.disabled = false;
      saveSettingsBtn.textContent = "Save & Sync";
    }

    // The voice session captured the old name when it was built; drop it so
    // the next join announces the new one. (Mid-call renames keep the name
    // everyone already sees, rather than reconnecting the call underneath them.)
    if (renamed && voice && !inVoice) {
      voice.destroy();
      voice = null;
    }
    if (renamed) presenceChannel.track({ username: myUsername });

    refreshPermalink();
    registerUser();
    fetchMessages();
  });

  // Start registration and fast 1.5s live polling
  registerUser();
  fetchMessages();

  // Skip polling while the tab is backgrounded — nobody's watching, so there's
  // no point hammering Supabase every 1.5s. Catches up immediately on return.
  let wasHidden = document.hidden;
  const pollInterval = setInterval(() => {
    if (!p.isConnected) {
      clearInterval(pollInterval);
      return;
    }
    if (document.hidden) {
      wasHidden = true;
      return;
    }
    if (wasHidden) wasHidden = false;
    fetchMessages();
  }, 1500);

  // Hang up the mic (and any screen share, and the signalling socket) if the
  // HUD is closed, or the chat panel itself is closed, while still in a call
  // -- otherwise the mic light stays on with nothing on screen to explain it.
  function teardownVoice() {
    if (inVoice) leaveVoice();
    if (voice) {
      voice.destroy();
      voice = null;
    }
    presenceChannel.close();
    document.removeEventListener("click", onDocClick, true);
  }
  root.addEventListener("lg:hud-close", teardownVoice);
  p.querySelector("[data-close]").addEventListener("click", teardownVoice);

  const onVisibilityChange = () => {
    if (!document.hidden && p.isConnected) fetchMessages();
    if (!p.isConnected) document.removeEventListener("visibilitychange", onVisibilityChange);
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  renderSidebar();
  renderOnline();

  return p;
}
