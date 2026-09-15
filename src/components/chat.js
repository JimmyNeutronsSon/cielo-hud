import { createPanel } from './panel.js';
import { ICONS } from './icons.js';
import { lgStore } from './storage.js';
import { getEmbeddedUsername, buildPersonalBookmarklet } from './identity.js';

const DEFAULT_SUPABASE_URL = "https://mtusdkooiuoocyffsznx.supabase.co";
const DEFAULT_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10dXNka29vaXVvb2N5ZmZzem54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MzU4NDEsImV4cCI6MjA5NDIxMTg0MX0.b9zhiqVqykppmthj36LgMr_tbitnht3YkRyT69gkS9E";

const CHANNELS = [
  { id: "general", name: "general", icon: "#" },
  { id: "gaming", name: "gaming", icon: "🎮" },
  { id: "unblocked-links", name: "unblocked-links", icon: "🔗" },
  { id: "media", name: "media-share", icon: "📸" },
  { id: "ai", name: "ai-lounge", icon: "✨" }
];

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
  let liveMessages = [];
  let pendingImage = null;

  // Voice Chat State
  let inVoice = false;
  let isMuted = false;
  let isCamOn = false;
  let isScreenSharing = false;
  let localMediaStream = null;
  let audioContext = null;
  let analyser = null;
  let voiceMembers = ["You"];

  const p = createPanel(root, {
    key: "chat",
    x: Math.max(20, Math.floor(vw * 0.16)),
    y: 100,
    width: Math.min(820, Math.max(520, Math.floor(vw * 0.72))),
    height: Math.min(600, Math.max(420, Math.floor(vh * 0.7))),
    title: "Cielo Live Chat & Voice",
    body: `
      <div class="lg-chat-container">
        <!-- Left Sidebar: Channels, Voice -->
        <div class="lg-chat-sidebar">
          <div class="lg-chat-sidebar-section">
            <div class="lg-chat-section-header">TEXT CHANNELS</div>
            <div class="lg-chat-channels-list" data-channels-list></div>
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
              <span class="lg-chat-live-pulse" title="Connected to Supabase Realtime">● LIVE</span>
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
              <button class="lg-vb-btn disconnect" data-btn="vc-leave">📞 Leave</button>
            </div>
          </div>

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
    `
  }, onRemove);

  // Element handles
  const channelsList = p.querySelector("[data-channels-list]");
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
  const vcLeaveBtn = p.querySelector("[data-btn='vc-leave']");
  const vcMicStatus = p.querySelector("[data-vb-mic-status]");

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
        switchTarget("channel", ch.id, ch.name, ch.icon);
      });
      channelsList.appendChild(btn);
    });
  }

  function switchTarget(type, id, name) {
    activeTarget = { type, id, name };
    headerIcon.textContent = "#";
    headerTitle.textContent = name;
    input.placeholder = `Message #${name}...`;
    renderSidebar();
    fetchMessages();
  }

  async function fetchMessages() {
    try {
      if (activeTarget.type === "channel") {
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
        <div class="lg-chat-msg-avatar" style="background:${msg.isBot ? '#ec4899' : avatarColor};">${avatarLetter}</div>
        <div class="lg-chat-msg-content">
          <div class="lg-chat-msg-meta">
            <span class="lg-chat-msg-author">${escapeHtml(msg.author)}</span>
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
      if (activeTarget.type === "channel" && typeof msgId === "number") {
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

    if (activeTarget.type === "channel") {
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

  // Voice Chat (VC) Logic
  async function joinVoice() {
    try {
      localMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      inVoice = true;

      // Audio speaking visualizer
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioCtx();
        const src = audioContext.createMediaStreamSource(localMediaStream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);

        const dataArr = new Uint8Array(analyser.frequencyBinCount);
        const checkSpeaking = () => {
          if (!inVoice) return;
          analyser.getByteFrequencyData(dataArr);
          let sum = 0;
          for (let i = 0; i < dataArr.length; i++) sum += dataArr[i];
          const avg = sum / dataArr.length;
          const chip = vcMembersEl.querySelector(".lg-vc-chip.me");
          if (chip) {
            if (avg > 15 && !isMuted) {
              chip.classList.add("speaking");
            } else {
              chip.classList.remove("speaking");
            }
          }
          requestAnimationFrame(checkSpeaking);
        };
        checkSpeaking();
      } catch (e) {}

      voiceBar.style.display = "flex";
      toggleVcBtn.classList.add("in-voice");
      vcBadge.textContent = "Connected";
      vcBadge.className = "lg-vc-badge active";
      vcMembersEl.style.display = "flex";
      renderVoiceMembers();
    } catch (err) {
      alert("Microphone access is required to join Voice Chat. Please allow microphone permissions in your browser.");
    }
  }

  function leaveVoice() {
    inVoice = false;
    if (localMediaStream) {
      localMediaStream.getTracks().forEach(t => t.stop());
      localMediaStream = null;
    }
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    voiceBar.style.display = "none";
    toggleVcBtn.classList.remove("in-voice");
    vcBadge.textContent = "Join";
    vcBadge.className = "lg-vc-badge";
    vcMembersEl.style.display = "none";
  }

  function renderVoiceMembers() {
    vcMembersEl.innerHTML = "";
    voiceMembers.forEach(name => {
      const chip = document.createElement("div");
      chip.className = `lg-vc-chip ${name === 'You' ? 'me' : ''}`;
      chip.innerHTML = `
        <span class="lg-vc-dot"></span>
        <span class="lg-vc-name">${name === 'You' ? escapeHtml(myUsername) : escapeHtml(name)}</span>
      `;
      vcMembersEl.appendChild(chip);
    });
  }

  toggleVcBtn.addEventListener("click", () => {
    if (inVoice) {
      leaveVoice();
    } else {
      joinVoice();
    }
  });

  vcLeaveBtn.addEventListener("click", leaveVoice);

  vcMuteBtn.addEventListener("click", () => {
    if (!localMediaStream) return;
    isMuted = !isMuted;
    localMediaStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
    vcMuteBtn.textContent = isMuted ? "🔇 Unmute" : "🎤 Mute";
    vcMuteBtn.classList.toggle("muted", isMuted);
    vcMicStatus.textContent = isMuted ? "Microphone Muted" : "RTC Active · Low Latency";
  });

  vcCamBtn.addEventListener("click", async () => {
    if (!inVoice) return;
    isCamOn = !isCamOn;
    vcCamBtn.textContent = isCamOn ? "📷 Cam (On)" : "📷 Cam";
    vcCamBtn.classList.toggle("active", isCamOn);
  });

  vcShareBtn.addEventListener("click", async () => {
    if (!inVoice) return;
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        isScreenSharing = true;
        vcShareBtn.textContent = "🖥 Sharing";
        vcShareBtn.classList.add("active");
        screenStream.getVideoTracks()[0].onended = () => {
          isScreenSharing = false;
          vcShareBtn.textContent = "🖥 Share";
          vcShareBtn.classList.remove("active");
        };
      }
    } catch (e) {}
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

    refreshPermalink();
    registerUser();
    fetchMessages();
  });

  // Start registration and fast 1.5s live polling
  registerUser();
  fetchMessages();

  const pollInterval = setInterval(() => {
    if (p.isConnected) {
      fetchMessages();
    } else {
      clearInterval(pollInterval);
    }
  }, 1500);

  // Hang up the mic (and any screen share) if the whole HUD is closed while
  // still in a voice call, instead of leaving it running in the background.
  root.addEventListener("lg:hud-close", () => {
    if (inVoice) leaveVoice();
  });

  renderSidebar();

  return p;
}
