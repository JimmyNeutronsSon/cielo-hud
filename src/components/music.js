import { createPanel } from "./panel.js";
import { ICONS } from "./icons.js";
import { loadTracks, backendFor, sourceLabel } from "./musicBackend.js";

// Loads a third-party SDK once per page and resolves when its global is ready.
function loadScript(id, src) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id);
    if (existing) {
      if (existing.dataset.ready === "1") resolve();
      else existing.addEventListener("load", () => resolve(), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.id = id;
    s.src = src;
    s.async = true;
    s.onload = () => {
      s.dataset.ready = "1";
      resolve();
    };
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function loadYouTubeApi() {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try {
        if (prev) prev();
      } catch {
        /* another player's callback threw — not ours to handle */
      }
      resolve(window.YT);
    };
    loadScript("youtube-iframe-api", "https://www.youtube.com/iframe_api").catch(() => {});
  });
}

function loadSoundCloudApi() {
  return loadScript(
    "soundcloud-widget-api",
    "https://w.soundcloud.com/player/api.js"
  ).then(() => window.SC);
}

function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function buildMusic(root, vw, vh, onRemove) {
  const width = Math.min(420, Math.max(320, Math.floor(vw * 0.32)));
  const height = Math.min(560, Math.max(400, Math.floor(vh * 0.72)));
  const x = Math.max(16, vw - width - 110);
  const y = Math.max(56, Math.floor((vh - height) / 2));

  const panel = createPanel(
    root,
    {
      key: "music",
      x: x,
      y: y,
      width: width,
      height: height,
      title: "Music",
      bodyClass: "lg-music-body",
      body: `
      <div class="lg-music">
        <div class="lg-music-toolbar">
          <div class="lg-music-search-wrap">
            <span class="lg-music-search-ic">${ICONS.search}</span>
            <input type="text" class="lg-music-search" placeholder="Search music…" spellcheck="false" />
          </div>
        </div>
        <div class="lg-music-list" data-list></div>
        <div class="lg-music-player" data-player>
          <div class="lg-music-embed" data-embed hidden></div>
          <div class="lg-music-now">
            <span class="lg-music-art" data-art><span class="lg-music-art-ph">${ICONS.music}</span></span>
            <span class="lg-music-now-meta">
              <span class="lg-music-now-name" data-now-name>Nothing playing</span>
              <span class="lg-music-now-artist" data-now-artist>Pick a track above</span>
            </span>
          </div>
          <div class="lg-music-seek">
            <span class="lg-music-time" data-cur>0:00</span>
            <input class="lg-music-range" type="range" min="0" max="1000" value="0" data-seek />
            <span class="lg-music-time" data-dur>0:00</span>
          </div>
          <div class="lg-music-controls">
            <button class="lg-music-btn" data-prev title="Previous">${ICONS.musicPrev}</button>
            <button class="lg-music-btn lg-music-play" data-play title="Play">${ICONS.musicPlay}</button>
            <button class="lg-music-btn" data-next title="Next">${ICONS.musicNext}</button>
            <span class="lg-music-vol">
              ${ICONS.musicVolume}
              <input class="lg-music-range" type="range" min="0" max="100" value="100" data-vol />
            </span>
          </div>
        </div>
      </div>
    `,
    },
    onRemove
  );

  const listEl = panel.querySelector("[data-list]");
  const searchInput = panel.querySelector(".lg-music-search");
  const embedEl = panel.querySelector("[data-embed]");
  const artEl = panel.querySelector("[data-art]");
  const nowName = panel.querySelector("[data-now-name]");
  const nowArtist = panel.querySelector("[data-now-artist]");
  const playBtn = panel.querySelector("[data-play]");
  const seekEl = panel.querySelector("[data-seek]");
  const volEl = panel.querySelector("[data-vol]");
  const curEl = panel.querySelector("[data-cur]");
  const durEl = panel.querySelector("[data-dur]");

  const audio = new Audio();
  audio.preload = "metadata";

  let queue = [];
  let index = -1;
  let seeking = false;
  let loadToken = 0;
  let playToken = 0;
  let searchTimer = null;
  let ytPlayer = null;
  let scWidget = null;
  let mode = "audio"; // audio | youtube | soundcloud
  let ticker = null;
  let volume = 1;

  // ── Embedded-player plumbing ──────────────────────────────────────────────
  function stopTicker() {
    if (ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  }

  function setProgress(cur, dur) {
    curEl.textContent = fmtTime(cur);
    if (dur) durEl.textContent = fmtTime(dur);
    if (!seeking && dur) {
      seekEl.value = String(Math.round((cur / dur) * 1000));
    }
  }

  function teardownEmbeds() {
    stopTicker();
    if (ytPlayer) {
      try {
        ytPlayer.destroy();
      } catch {
        /* iframe already gone */
      }
      ytPlayer = null;
    }
    scWidget = null;
    embedEl.innerHTML = "";
    embedEl.hidden = true;
  }

  function resetPlayback() {
    try {
      audio.pause();
    } catch {
      /* no source loaded yet */
    }
    teardownEmbeds();
  }

  async function playYouTube(id) {
    const YT = await loadYouTubeApi();
    embedEl.hidden = false;
    embedEl.innerHTML = '<div data-yt-mount></div>';
    // Chrome only allows autoplay-with-sound when it's triggered directly by
    // a user gesture. By the time the IFrame API has loaded and the player
    // is ready, the click that opened this track no longer counts as one, so
    // an unmuted playVideo() here gets silently blocked (video "plays" in
    // the UI but no audio ever starts). Muted autoplay is always allowed, so
    // start muted and unmute the moment real playback begins instead.
    let unmuted = false;
    return new Promise((resolve, reject) => {
      ytPlayer = new YT.Player(embedEl.querySelector("[data-yt-mount]"), {
        videoId: id,
        playerVars: {
          autoplay: 1,
          mute: 1,
          controls: 0,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: (e) => {
            e.target.playVideo();
            resolve();
          },
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.PLAYING) {
              if (!unmuted) {
                unmuted = true;
                e.target.unMute();
                e.target.setVolume(Math.round(volume * 100));
              }
              if (!ticker) {
                ticker = setInterval(() => {
                  if (!ytPlayer || !ytPlayer.getDuration) return;
                  setProgress(ytPlayer.getCurrentTime() || 0, ytPlayer.getDuration() || 0);
                }, 500);
              }
              updatePlayIcon(true);
            } else if (e.data === YT.PlayerState.PAUSED) updatePlayIcon(false);
            else if (e.data === YT.PlayerState.ENDED) step(1);
          },
          // YouTube's own error codes: https://developers.google.com/youtube/iframe_api_reference#onError
          onError: (e) => {
            const messages = {
              2: "Invalid video",
              5: "Playback error",
              100: "Video not found or made private",
              101: "Embedding disabled by the uploader",
              150: "Embedding disabled by the uploader",
            };
            reject(new Error(messages[e.data] || `YouTube playback unavailable (code ${e.data})`));
          },
        },
      });
    });
  }

  async function playSoundCloud(url) {
    const SC = await loadSoundCloudApi();
    embedEl.hidden = false;
    const frame = document.createElement("iframe");
    frame.setAttribute("allow", "autoplay");
    frame.src = url;
    embedEl.appendChild(frame);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("SoundCloud timeout")), 12000);
      const widget = SC.Widget(frame);
      scWidget = widget;
      widget.bind(SC.Widget.Events.READY, () => {
        clearTimeout(timer);
        widget.setVolume(Math.round(volume * 100));
        widget.play();
        resolve();
      });
      widget.bind(SC.Widget.Events.PLAY, () => updatePlayIcon(true));
      widget.bind(SC.Widget.Events.PAUSE, () => updatePlayIcon(false));
      widget.bind(SC.Widget.Events.FINISH, () => step(1));
      widget.bind(SC.Widget.Events.PLAY_PROGRESS, (e) => {
        widget.getDuration((ms) => setProgress(e.currentPosition / 1000, ms / 1000));
      });
    });
  }

  // ── Library list ──────────────────────────────────────────────────────────
  function setMessage(text, isError) {
    listEl.innerHTML = "";
    const div = document.createElement("div");
    div.className = "lg-music-empty" + (isError ? " lg-music-err" : "");
    div.textContent = text;
    listEl.appendChild(div);
  }

  function renderResults(tracks, heading, note) {
    listEl.innerHTML = "";
    if (!tracks.length) {
      setMessage("No tracks found.");
      return;
    }
    if (heading) {
      const h = document.createElement("div");
      h.className = "lg-music-heading";
      h.textContent = heading;
      listEl.appendChild(h);
    }
    if (note) {
      const n = document.createElement("div");
      n.className = "lg-music-note";
      n.textContent = note;
      listEl.appendChild(n);
    }
    tracks.forEach((song, i) => {
      const row = document.createElement("button");
      row.className = "lg-music-row";
      row.dataset.i = String(i);

      const cover = document.createElement("span");
      cover.className = "lg-music-row-art";
      if (song.thumb) {
        const img = new Image();
        img.loading = "lazy";
        img.alt = "";
        img.src = song.thumb;
        cover.appendChild(img);
      }

      const meta = document.createElement("span");
      meta.className = "lg-music-row-meta";
      const name = document.createElement("span");
      name.className = "lg-music-row-name";
      name.textContent = song.name;
      name.title = song.name;
      const artist = document.createElement("span");
      artist.className = "lg-music-row-artist";
      artist.textContent = song.artist;
      meta.appendChild(name);
      meta.appendChild(artist);

      const dur = document.createElement("span");
      dur.className = "lg-music-row-dur";
      dur.textContent = song.duration ? fmtTime(song.duration) : "";

      row.appendChild(cover);
      row.appendChild(meta);
      row.appendChild(dur);
      row.addEventListener("click", () => play(i));
      listEl.appendChild(row);
    });
    markActiveRow();
  }

  function markActiveRow() {
    listEl.querySelectorAll(".lg-music-row").forEach((row) => {
      row.classList.toggle("active", Number(row.dataset.i) === index);
    });
  }

  async function load(method, arg, heading, pending) {
    const token = ++loadToken;
    setMessage(pending);
    const skipped = [];
    let tracks;
    try {
      tracks = await loadTracks(method, arg, (backend, why) => {
        skipped.push(`${backend} (${why})`);
      });
    } catch (err) {
      if (token !== loadToken) return;
      setMessage(`Couldn't load music: ${err.message}`, true);
      return;
    }
    if (token !== loadToken) return;
    queue = tracks;
    index = -1;
    const source = sourceLabel(tracks.length ? tracks[0].source : "");
    renderResults(
      queue,
      heading ? `${heading} · ${source}` : source,
      skipped.length ? `Unavailable: ${skipped.join(", ")} — showing ${source}.` : ""
    );
  }

  const showTrending = () => load("trending", undefined, "Trending", "Loading trending…");
  const search = (q) => load("search", q, "Results", "Searching…");

  // ── Playback ──────────────────────────────────────────────────────────────
  async function play(i) {
    if (i < 0 || i >= queue.length) return;
    const token = ++playToken;
    index = i;
    const song = queue[i];
    markActiveRow();
    nowName.textContent = song.name;
    nowArtist.textContent = song.artist;
    nowArtist.classList.remove("lg-music-err-text");
    artEl.innerHTML = "";
    if (song.cover || song.thumb) {
      const img = new Image();
      img.alt = "";
      img.src = song.cover || song.thumb;
      artEl.appendChild(img);
    } else {
      artEl.innerHTML = `<span class="lg-music-art-ph">${ICONS.music}</span>`;
    }
    durEl.textContent = song.duration ? fmtTime(song.duration) : "0:00";
    resetPlayback();

    try {
      const src = await backendFor(song).resolve(song);
      if (token !== playToken) return;
      mode = src.kind;
      if (src.kind === "youtube") await playYouTube(src.id);
      else if (src.kind === "soundcloud") await playSoundCloud(src.url);
      else {
        audio.src = src.url;
        audio.volume = volume;
        await audio.play();
      }
    } catch (err) {
      if (token !== playToken) return;
      nowArtist.textContent = err.message;
      nowArtist.classList.add("lg-music-err-text");
      // Official/label uploads routinely disable third-party embedding —
      // this isn't recoverable for that specific video, so move on to the
      // next result automatically instead of leaving playback stuck.
      if (queue.length > 1) {
        setTimeout(() => {
          if (token === playToken) step(1);
        }, 1400);
      }
    }
  }

  function step(delta) {
    if (!queue.length) return;
    play((index + delta + queue.length) % queue.length);
  }

  function isPaused() {
    if (mode === "youtube" && ytPlayer && ytPlayer.getPlayerState) {
      return ytPlayer.getPlayerState() !== 1;
    }
    if (mode === "soundcloud") return playBtn.dataset.playing !== "1";
    return audio.paused;
  }

  function updatePlayIcon(playing) {
    const on = playing === undefined ? !isPaused() : playing;
    playBtn.dataset.playing = on ? "1" : "0";
    playBtn.innerHTML = on ? ICONS.musicPause : ICONS.musicPlay;
    playBtn.title = on ? "Pause" : "Play";
  }

  function togglePlay() {
    if (mode === "youtube" && ytPlayer) {
      if (isPaused()) ytPlayer.playVideo();
      else ytPlayer.pauseVideo();
      return;
    }
    if (mode === "soundcloud" && scWidget) {
      scWidget.toggle();
      return;
    }
    if (!audio.src) {
      if (queue.length) play(0);
      return;
    }
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }

  function seekTo(fraction) {
    if (mode === "youtube" && ytPlayer && ytPlayer.getDuration) {
      ytPlayer.seekTo(fraction * (ytPlayer.getDuration() || 0), true);
      return;
    }
    if (mode === "soundcloud" && scWidget) {
      scWidget.getDuration((ms) => scWidget.seekTo(fraction * ms));
      return;
    }
    if (audio.duration) audio.currentTime = fraction * audio.duration;
  }

  function applyVolume() {
    if (mode === "youtube" && ytPlayer && ytPlayer.setVolume) {
      ytPlayer.setVolume(Math.round(volume * 100));
    } else if (mode === "soundcloud" && scWidget) {
      scWidget.setVolume(Math.round(volume * 100));
    }
    audio.volume = volume;
  }

  // ── Wiring ────────────────────────────────────────────────────────────────
  playBtn.addEventListener("click", togglePlay);
  panel.querySelector("[data-prev]").addEventListener("click", () => step(-1));
  panel.querySelector("[data-next]").addEventListener("click", () => step(1));

  audio.addEventListener("play", () => updatePlayIcon(true));
  audio.addEventListener("pause", () => updatePlayIcon(false));
  audio.addEventListener("ended", () => step(1));
  audio.addEventListener("loadedmetadata", () => {
    if (isFinite(audio.duration)) durEl.textContent = fmtTime(audio.duration);
  });
  audio.addEventListener("timeupdate", () => {
    if (mode === "audio") setProgress(audio.currentTime, audio.duration || 0);
  });

  seekEl.addEventListener("pointerdown", () => { seeking = true; });
  const commitSeek = () => {
    seekTo(Number(seekEl.value) / 1000);
    seeking = false;
  };
  seekEl.addEventListener("change", commitSeek);
  seekEl.addEventListener("pointerup", commitSeek);

  volEl.addEventListener("input", () => {
    volume = Number(volEl.value) / 100;
    applyVolume();
  });

  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (!q) {
      showTrending();
      return;
    }
    searchTimer = setTimeout(() => search(q), 350);
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (q) search(q);
  });

  // Stop playback when the panel closes or the whole HUD is torn down.
  const teardown = () => {
    playToken++;
    loadToken++;
    resetPlayback();
    audio.removeAttribute("src");
    audio.load();
    clearTimeout(searchTimer);
    root.removeEventListener("lg:hud-close", teardown);
  };
  root.addEventListener("lg:hud-close", teardown);
  panel.querySelector("[data-close]").addEventListener("click", teardown);

  updatePlayIcon(false);
  showTrending();
  return panel;
}
