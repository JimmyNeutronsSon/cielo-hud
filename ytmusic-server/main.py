from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from ytmusicapi import YTMusic

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# Unauthenticated client: search() works fine without login. Auth is only
# required for personal-library features (playlists, history, uploads),
# which this API doesn't use.
yt = YTMusic()


def to_track(item):
    thumbs = item.get("thumbnails") or []
    thumb = thumbs[-1]["url"] if thumbs else ""
    artists = item.get("artists") or []
    artist = ", ".join(a["name"] for a in artists if a.get("name"))
    return {
        "id": item.get("videoId"),
        "name": item.get("title") or "",
        "artist": artist,
        "thumb": thumb,
        "duration": item.get("duration_seconds") or 0,
    }


@app.get("/search")
def search(q: str = Query(..., min_length=1)):
    results = yt.search(q, filter="songs", limit=20)
    tracks = [to_track(r) for r in results if r.get("videoId")]
    return {"results": tracks}


@app.get("/trending")
def trending():
    # ytmusicapi has no unauthenticated "trending" endpoint, so approximate
    # it with a broad popular-music search.
    results = yt.search("top hits 2026", filter="songs", limit=20)
    tracks = [to_track(r) for r in results if r.get("videoId")]
    return {"results": tracks}


@app.get("/health")
def health():
    return {"ok": True}
