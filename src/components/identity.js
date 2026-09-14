/**
 * Cross-site identity sync.
 *
 * localStorage is scoped per-origin, so a username saved via lgStore() while
 * running on site A is invisible when the same bookmarklet runs on site B.
 * To get "log in once per bookmarklet install, works on every site" without
 * an actual login step, we mirror the username into a hidden iframe pointed
 * at one fixed origin (Supabase Storage, same place bundle.js is hosted) and
 * talk to it with postMessage. That iframe's localStorage is the same no
 * matter which site embedded it, so it acts as the single source of truth.
 *
 * If the iframe never responds (blocked by a page's CSP, offline, etc.) we
 * silently fall back to the existing per-site identity -- the feature
 * degrades gracefully instead of breaking the chat.
 */
const IDENTITY_URL = "https://mtusdkooiuoocyffsznx.supabase.co/storage/v1/object/public/bookmarklet/identity.html";
const HANDSHAKE_TIMEOUT_MS = 2500;

let framePromise = null;

function getFrame() {
  if (framePromise) return framePromise;
  framePromise = new Promise((resolve) => {
    try {
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = IDENTITY_URL;
      iframe.addEventListener("load", () => resolve(iframe));
      iframe.addEventListener("error", () => resolve(null));
      document.body.appendChild(iframe);
      setTimeout(() => resolve(iframe), HANDSHAKE_TIMEOUT_MS);
    } catch (e) {
      resolve(null);
    }
  });
  return framePromise;
}

function call(type, payload) {
  return new Promise((resolve) => {
    getFrame().then((iframe) => {
      if (!iframe || !iframe.contentWindow) return resolve(null);
      const reqId = Math.random().toString(36).slice(2);
      let done = false;
      const onMessage = (e) => {
        const msg = e.data;
        if (!msg || msg.reqId !== reqId) return;
        if (done) return;
        done = true;
        window.removeEventListener("message", onMessage);
        resolve(msg);
      };
      window.addEventListener("message", onMessage);
      iframe.contentWindow.postMessage({ type, reqId, ...payload }, "*");
      setTimeout(() => {
        if (done) return;
        done = true;
        window.removeEventListener("message", onMessage);
        resolve(null);
      }, HANDSHAKE_TIMEOUT_MS);
    });
  });
}

/** Resolves to the shared username, or null if the broker is unreachable. */
export function getSharedUsername() {
  return call("lg-id-get", {}).then((res) => (res ? res.username : null));
}

/** Fire-and-forget: mirror a username into the shared broker. */
export function setSharedUsername(username) {
  if (!username) return Promise.resolve();
  return call("lg-id-set", { username }).then(() => {});
}
