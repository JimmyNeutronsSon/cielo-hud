(function () {
  /**
   * Welkin — Secret Cloak System
   * Automatically embeds the site in an about:blank page on load.
   */

  const DECOY_URL = "https://lwsd414.instructure.com/";
  const DECOY_TITLE = "My Apps";
  const DECOY_ICON = "classlink.ico";

  // Skip if already cloaked (running inside the about:blank iframe)
  if (
    window.top !== window.self ||
    window.location.protocol === "about:" ||
    window.location.href.includes("about:blank")
  ) {
    return;
  }

  // Cloak function
  const cloak = () => {
    const win = window.open("about:blank", "_blank");

    if (win) {
      const doc = win.document;
      doc.title = DECOY_TITLE;

      // Add Favicon
      const link = doc.createElement("link");
      link.rel = "icon";
      link.type = "image/x-icon";
      link.href = DECOY_ICON;
      doc.head.appendChild(link);

      // Reset styles
      doc.body.style.margin = "0";
      doc.body.style.height = "100vh";
      doc.body.style.overflow = "hidden";
      doc.body.style.background = "#000";

      // Create Iframe that embeds this site
      const iframe = doc.createElement("iframe");
      iframe.style.border = "none";
      iframe.style.width = "100vw";
      iframe.style.height = "100vh";
      iframe.style.margin = "0";
      iframe.src = window.location.origin + window.location.pathname;

      doc.body.appendChild(iframe);

      // Redirect original tab to decoy
      window.location.replace(DECOY_URL);
    }
  };

  // Automatically cloak as soon as the page is opened
  cloak();
})();

