import { createPanel } from "./panel.js";
import { ICONS } from "./icons.js";
import { GAME_CATALOG, GAME_SOURCES } from "../games/catalog.js";

// ── Source metadata (colors used for the small "src" pill on built-in cards) ──
const SRC_META = {
  gn: { label: "", color: "#5ee7ff" },
  builtin: { label: "Built-in", color: "#4ade80" },
};

const BUILTIN_GAME = {
  s: "builtin",
  n: "Tic-Tac-Toe",
  d: "Built right into the widget — the classic X's and O's.",
};

const allGames = [BUILTIN_GAME, ...GAME_CATALOG];

// gn-math pages are fetched as text (raw.githubusercontent is the only public
// mirror — jsDelivr actively blocks the gn-math user — and raw forbids direct
// framing with X-Frame-Options: deny) and injected through srcdoc.
// The sandbox flags below are what sub-resource-heavy web games need to run.
const SANDBOX =
  "allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups " +
  "allow-popups-to-escape-sandbox allow-modals allow-downloads";

// In-memory cache of fetched game HTML so re-opening a game is instant.
const htmlCache = new Map();

// ── URL helpers ──────────────────────────────────────────────────────────────
function thumbUrl(e) {
  if (e.s === "gn" && e.c) {
    return `${GAME_SOURCES.coversRaw}/${e.i}.png`;
  }
  return "";
}

function sourcePageUrl(e) {
  if (e.s === "gn") return `https://github.com/gn-math/html/blob/main/${e.f}`;
  return "";
}

async function fetchCached(url) {
  let hit = htmlCache.get(url);
  if (hit) return hit;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  hit = await res.text();
  htmlCache.set(url, hit);
  return hit;
}

function showLoadError(frame, msg) {
  const err = document.createElement("div");
  err.className = "lg-games-error";
  err.innerHTML = `
    <div class="lg-games-error-box">
      <div class="lg-games-error-title">This game can't be loaded 😢</div>
      <div class="lg-games-error-msg"></div>
    </div>`;
  err.querySelector(".lg-games-error-msg").textContent = msg;
  frame.replaceWith(err);
}

// ── Launchers (all pull from the upstream sources, live) ────────────────────
async function launchGnMath(e, frame) {
  const url = `${GAME_SOURCES.gnMathRaw}/${e.f}`;
  let html;
  try {
    html = await fetchCached(url);
  } catch (err) {
    showLoadError(frame, `Could not fetch "${e.n}" from gn-math/html.\n${err.message}`);
    return;
  }
  frame.src = "about:blank";
  frame.sandbox = SANDBOX;
  frame.srcdoc = html;
}

export function buildGames(root, vw, vh, onRemove) {
  const width = Math.min(900, Math.max(560, Math.floor(vw * 0.85)));
  const height = Math.min(660, Math.max(420, Math.floor(vh * 0.8)));
  const x = Math.max(16, Math.floor((vw - width) / 2));
  const y = Math.max(56, Math.floor((vh - height) / 2) - 8);

  const panel = createPanel(root, {
    key: "games",
    x: x,
    y: y,
    width: width,
    height: height,
    title: "Games",
    bodyClass: "lg-games-body",
    body: `
      <div class="lg-games">
        <div class="lg-games-toolbar">
          <div class="lg-games-search-wrap">
            <span class="lg-games-search-ic">${ICONS.search}</span>
            <input type="text" class="lg-games-search" placeholder="Search games…" spellcheck="false" />
            <span class="lg-games-count"></span>
          </div>
          <div class="lg-games-chips" data-chips></div>
        </div>
        <div class="lg-games-list" data-list></div>
        <div class="lg-games-player" data-player>
          <div class="lg-games-playerbar">
            <button class="lg-games-pbtn" data-back title="Back to library">${ICONS.back}</button>
            <span class="lg-games-pthumb" data-pthumb></span>
            <div class="lg-games-pinfo">
              <span class="lg-games-pname" data-pname></span>
              <span class="lg-games-psrc" data-psrc></span>
            </div>
            <button class="lg-games-pbtn" data-fullscreen title="Full screen">${ICONS.maximize}</button>
            <button class="lg-games-pbtn" data-external title="Open at its source in a new tab">${ICONS.external}</button>
          </div>
          <div class="lg-games-frame-wrap" data-frame-wrap></div>
        </div>
      </div>
    `
  }, onRemove);

  const listEl = panel.querySelector("[data-list]");
  const playerEl = panel.querySelector("[data-player]");
  const frameWrap = panel.querySelector("[data-frame-wrap]");
  const chipsEl = panel.querySelector("[data-chips]");
  const searchInput = panel.querySelector(".lg-games-search");
  const countEl = panel.querySelector(".lg-games-count");

  let srcFilter = "all";
  let currentEntry = null;

  // ── Source filter chips ──
  const chipDefs = [
    ["all", "All"],
    ["builtin", "Built-in"]
  ];
  for (const [k, label] of chipDefs) {
    const b = document.createElement("button");
    b.className = "lg-games-chip" + (k === srcFilter ? " active" : "");
    b.dataset.src = k;
    b.textContent = label;
    b.addEventListener("click", () => {
      srcFilter = k;
      chipsEl.querySelectorAll("button").forEach((c) => {
        c.classList.toggle("active", c.dataset.src === srcFilter);
      });
      renderList();
    });
    chipsEl.appendChild(b);
  }

  function matches(g, q) {
    if (srcFilter !== "all" && g.s !== srcFilter) return false;
    if (!q) return true;
    const hay = `${g.n} ${g.f || ""} ${g.i !== undefined ? String(g.i) : ""}`;
    return hay.toLowerCase().includes(q);
  }

  function initials(name) {
    const words = String(name)
      .replace(/[^A-Za-z0-9 'I-]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    return words.slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
  }

  function renderList() {
    const q = searchInput.value.trim().toLowerCase();
    listEl.innerHTML = "";
    let shown = 0;
    for (const g of allGames) {
      if (!matches(g, q)) continue;
      shown++;
      listEl.appendChild(buildCard(g));
    }
    countEl.textContent = `${shown} / ${allGames.length}`;
  }

  function buildCard(g) {
    const card = document.createElement("button");
    card.className = "lg-games-card";
    card.dataset.s = g.s;
    if (g.i !== undefined) card.dataset.i = String(g.i);
    const metaColor = SRC_META[g.s].color;

    const cover = document.createElement("span");
    cover.className = "lg-games-cover";
    cover.style.setProperty("--src-color", metaColor);
    const tile = document.createElement("span");
    tile.className = "lg-games-tile";
    tile.textContent = g.s === "builtin" ? "⊕" : initials(g.n);
    cover.appendChild(tile);
    const url = thumbUrl(g);
    if (url) {
      const img = new Image();
      img.decoding = "async";
      img.alt = "";
      img.addEventListener("load", () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) cover.classList.add("has-img");
      });
      img.src = url;
      cover.appendChild(img);
    }

    const meta = document.createElement("span");
    meta.className = "lg-games-meta";
    meta.style.setProperty("--src-color", metaColor);
    const nameEl = document.createElement("span");
    nameEl.className = "lg-games-name";
    nameEl.textContent = g.n;
    nameEl.title = g.n + (g.d ? `\n${g.d}` : "");
    meta.appendChild(nameEl);
    if (SRC_META[g.s].label) {
      const tag = document.createElement("span");
      tag.className = "lg-games-tag";
      tag.textContent = SRC_META[g.s].label;
      meta.appendChild(tag);
    }
    card.appendChild(cover);
    card.appendChild(meta);
    card.addEventListener("click", () => openGame(g));
    return card;
  }

  const pthumbEl = playerEl.querySelector("[data-pthumb]");
  const fullscreenBtn = playerEl.querySelector("[data-fullscreen]");

  function openGame(g) {
    currentEntry = g;
    playerEl.querySelector("[data-pname]").textContent = g.n;
    playerEl.querySelector("[data-psrc]").textContent =
      g.s === "builtin" ? "Built into the widget" : (g.i !== undefined ? "#" + g.i : "");
    playerEl.querySelector("[data-external]").style.visibility =
      g.s === "builtin" ? "hidden" : "";
    fullscreenBtn.style.visibility = g.s === "builtin" ? "hidden" : "";

    pthumbEl.innerHTML = "";
    const thumb = thumbUrl(g);
    if (thumb) {
      const img = new Image();
      img.loading = "lazy";
      img.alt = "";
      img.src = thumb;
      pthumbEl.appendChild(img);
    } else {
      pthumbEl.textContent = g.s === "builtin" ? "⊕" : initials(g.n);
    }

    listEl.style.display = "none";
    playerEl.style.display = "flex";

    // Tear down any previous document so its audio/timers stop for good.
    frameWrap.innerHTML = "";
    if (g.s === "builtin") {
      launchBuiltin();
      return;
    }
    const nf = document.createElement("iframe");
    nf.className = "lg-games-frame";
    nf.allow = "autoplay; fullscreen; gamepad; pointer-lock; accelerometer; gyroscope";
    frameWrap.appendChild(nf);
    launchGnMath(g, nf);
  }

  playerEl.querySelector("[data-back]").addEventListener("click", () => {
    if (document.fullscreenElement === frameWrap) document.exitFullscreen();
    frameWrap.innerHTML = ""; // destroys the iframe → stops the running game
    currentEntry = null;
    playerEl.style.display = "none";
    listEl.style.display = "";
    renderList();
  });

  playerEl.querySelector("[data-external]").addEventListener("click", () => {
    const url = currentEntry && sourcePageUrl(currentEntry);
    if (url) window.open(url, "_blank", "noopener");
  });

  fullscreenBtn.addEventListener("click", () => {
    if (document.fullscreenElement === frameWrap) {
      document.exitFullscreen();
    } else {
      frameWrap.requestFullscreen?.();
    }
  });

  document.addEventListener("fullscreenchange", () => {
    const isFull = document.fullscreenElement === frameWrap;
    fullscreenBtn.innerHTML = isFull ? ICONS.minimize : ICONS.maximize;
    fullscreenBtn.title = isFull ? "Exit full screen" : "Full screen";
    frameWrap.classList.toggle("lg-games-frame-wrap-full", isFull);
  });

  searchInput.addEventListener("input", () => renderList());

  // ── Built-in: Tic-Tac-Toe ──
  function launchBuiltin() {
    const view = document.createElement("div");
    view.className = "lg-tictactoe";
    view.innerHTML = `
      <div class="lg-tictactoe-status">Tic-Tac-Toe — X's turn</div>
      <div class="lg-tictactoe-board"></div>
      <button class="lg-tictactoe-reset">Reset</button>`;
    frameWrap.appendChild(view);

    const board = view.querySelector(".lg-tictactoe-board");
    const statusLabel = view.querySelector(".lg-tictactoe-status");
    const resetBtn = view.querySelector(".lg-tictactoe-reset");
    const wins = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];
    let cells = Array(9).fill(null);
    let turn = "X";
    let over = false;

    function checkWinner() {
      for (const [a, b, c] of wins) {
        if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) return cells[a];
      }
      if (cells.every(Boolean)) return "draw";
      return null;
    }

    function render() {
      board.innerHTML = "";
      cells.forEach((val, i) => {
        const btn = document.createElement("button");
        btn.textContent = val || "";
        btn.addEventListener("click", () => handleMove(i));
        board.appendChild(btn);
      });
    }

    function handleMove(i) {
      if (over || cells[i]) return;
      cells[i] = turn;
      const result = checkWinner();
      if (result) {
        over = true;
        statusLabel.textContent = result === "draw" ? "It's a draw!" : `${result} wins!`;
      } else {
        turn = turn === "X" ? "O" : "X";
        statusLabel.textContent = `Tic-Tac-Toe — ${turn}'s turn`;
      }
      render();
    }

    resetBtn.addEventListener("click", () => {
      cells = Array(9).fill(null);
      turn = "X";
      over = false;
      statusLabel.textContent = "Tic-Tac-Toe — X's turn";
      render();
    });
    render();
  }

  renderList();

  return panel;
}
