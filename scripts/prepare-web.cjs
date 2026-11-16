const fs = require("node:fs");
const path = require("node:path");

const indexPath = path.join(process.cwd(), "dist", "index.html");
let html = fs.readFileSync(indexPath, "utf8");

html = html.replace(
  /content="width=device-width, initial-scale=1, shrink-to-fit=no"/,
  'content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"'
);

html = html.replace(
  "</head>",
  `  <meta name="color-scheme" content="light" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="description" content="Translate menus, see every dish and order with confidence using Tavue." />
    <meta name="apple-mobile-web-app-title" content="Tavue" />
    <meta property="og:title" content="Tavue — Visual Menu" />
    <meta property="og:description" content="Translate menus, see every dish and order with confidence." />
    <meta property="og:type" content="website" />
    <style id="tavue-web-shell">
      html, body, #root {
        height: var(--tavue-viewport-height, 100dvh) !important;
        min-height: 0 !important;
        max-height: var(--tavue-viewport-height, 100dvh);
        width: 100%;
        max-width: 100%;
        background-color: #F7F3EE;
      }
      html, body {
        margin: 0;
        overflow-x: hidden;
        overscroll-behavior-y: none;
      }
      body {
        -webkit-text-size-adjust: 100%;
      }
      #tavue-app-shell {
        height: var(--tavue-viewport-height, 100dvh);
        max-height: var(--tavue-viewport-height, 100dvh);
      }
      body > div:not(#root) [role="dialog"] {
        top: var(--tavue-viewport-offset-top, 0px) !important;
        bottom: auto !important;
        left: var(--tavue-viewport-offset-left, 0px) !important;
        right: auto !important;
        height: var(--tavue-viewport-height, 100dvh) !important;
        max-height: var(--tavue-viewport-height, 100dvh);
        width: var(--tavue-viewport-width, 100vw) !important;
        max-width: var(--tavue-viewport-width, 100vw);
        overflow-x: hidden;
      }
      #tavue-order-backdrop {
        min-width: 0 !important;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box;
      }
      #tavue-order-sheet {
        min-width: 0 !important;
        width: 100% !important;
        max-width: min(640px, 100%) !important;
        box-sizing: border-box;
      }
      @media (hover: none) and (pointer: coarse) {
        #tavue-app-shell {
          width: 100vw !important;
          max-width: none !important;
        }
      }
    </style>
    <script id="tavue-visual-viewport">
      (() => {
        const root = document.documentElement;
        let frame = 0;

        const applyViewport = () => {
          frame = 0;
          const viewport = window.visualViewport;
          const height = viewport?.height || window.innerHeight;
          const width = viewport?.width || document.documentElement.clientWidth || window.innerWidth;
          const offsetTop = viewport?.offsetTop || 0;
          const offsetLeft = viewport?.offsetLeft || 0;
          if (height > 0) {
            root.style.setProperty("--tavue-viewport-height", Math.round(height) + "px");
          }
          if (width > 0) {
            root.style.setProperty("--tavue-viewport-width", Math.round(width) + "px");
          }
          root.style.setProperty("--tavue-viewport-offset-top", Math.round(offsetTop) + "px");
          root.style.setProperty("--tavue-viewport-offset-left", Math.round(offsetLeft) + "px");
        };

        const scheduleViewport = () => {
          if (frame) return;
          frame = window.requestAnimationFrame(applyViewport);
        };

        const resetHorizontalScroll = () => {
          document.documentElement.scrollLeft = 0;
          if (document.body) document.body.scrollLeft = 0;
        };

        applyViewport();
        resetHorizontalScroll();
        document.addEventListener("DOMContentLoaded", resetHorizontalScroll, { once: true });
        window.addEventListener("resize", scheduleViewport, { passive: true });
        window.addEventListener("orientationchange", () => {
          resetHorizontalScroll();
          scheduleViewport();
        }, { passive: true });
        window.addEventListener("pageshow", () => {
          resetHorizontalScroll();
          scheduleViewport();
        }, { passive: true });
        window.visualViewport?.addEventListener("resize", scheduleViewport, { passive: true });
        window.visualViewport?.addEventListener("scroll", scheduleViewport, { passive: true });
        document.addEventListener("visibilitychange", () => {
          if (!document.hidden) {
            resetHorizontalScroll();
            scheduleViewport();
          }
        });
      })();
    </script>
  </head>`
);

fs.writeFileSync(indexPath, html);
