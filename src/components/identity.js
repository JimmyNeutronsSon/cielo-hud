/**
 * Cross-site account persistence.
 *
 * localStorage is scoped per-origin (and can be blocked outright on pages
 * that render inside a sandboxed iframe lacking 'allow-same-origin' -- no
 * script, ours or the page's own, can read/write storage there at all). So
 * instead of relying on browser storage to carry the identity between
 * sites, the username is embedded directly in the bookmarklet's own
 * javascript: URL, which the browser stores in the bookmarks bar itself --
 * completely independent of any page's storage or sandboxing.
 *
 * captureBootstrapUsername() must be called synchronously at bundle
 * startup (document.currentScript is only valid during the initial
 * synchronous script execution).
 */
const BUNDLE_URL = "https://mtusdkooiuoocyffsznx.supabase.co/storage/v1/object/public/bookmarklet/bundle.js";

let embeddedUsername = null;

export function captureBootstrapUsername() {
  try {
    const src = document.currentScript && document.currentScript.src;
    if (src) {
      const u = new URL(src).searchParams.get("u");
      if (u) embeddedUsername = u;
    }
  } catch (e) {}
  return embeddedUsername;
}

/** The username embedded in the bookmarklet link that loaded this bundle, if any. */
export function getEmbeddedUsername() {
  return embeddedUsername;
}

/** Builds the javascript: bookmarklet URL for a given username, embedding it. */
export function buildPersonalBookmarklet(username) {
  const loaderSrc = `void function(){var d=document,s=d.createElement("script");s.src=${JSON.stringify(BUNDLE_URL)}+"?v="+Date.now()+"&u="+encodeURIComponent(${JSON.stringify(username)});d.head.appendChild(s);}();`;
  return "javascript:" + encodeURIComponent(loaderSrc);
}
