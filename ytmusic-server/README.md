# ytmusic-server

Tiny FastAPI wrapper around [`ytmusicapi`](https://ytmusicapi.readthedocs.io) exposing unauthenticated
YouTube Music search as JSON, used by the Music widget (`src/components/musicBackend.js`). Runs
alongside the Scramjet proxy on the same box, reverse-proxied at `https://api.ritebooks.com/ytmusic/`.

No Google account or auth is involved — `YTMusic()`'s `search()` works unauthenticated. Playback
uses YouTube's own official IFrame Player API client-side; this server only returns metadata and
video ids, never audio streams.

## Deploy

```bash
python3 -m venv ~/ytmusic-env
source ~/ytmusic-env/bin/activate
pip install ytmusicapi fastapi "uvicorn[standard]"

pm2 start ~/ytmusic-env/bin/uvicorn --name ytmusic --interpreter none -- main:app --host 127.0.0.1 --port 5001
pm2 save
```

Then add an nginx `location /ytmusic/` block in front of it that rewrites the prefix away and
proxies to `http://127.0.0.1:5001` (see the existing Scramjet nginx site).
