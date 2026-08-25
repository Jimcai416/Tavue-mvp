import apiWorker from "./index.js";

const RELEASE_VERSION = "0.9.1";
const API_GET_ROUTES = new Set(["/privacy", "/support"]);
const API_WRITE_ROUTES = new Set(["/scan", "/events", "/feedback"]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === "GET" && url.pathname === "/health") {
      return new Response(
        JSON.stringify({ ok: true, service: "tavue-api", version: RELEASE_VERSION }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Keep Tavue API and policy/support endpoints on the API worker.
    if (
      API_GET_ROUTES.has(url.pathname) ||
      API_WRITE_ROUTES.has(url.pathname) ||
      method === "OPTIONS"
    ) {
      return apiWorker.fetch(request, env, ctx);
    }

    // The combined deployment can also serve the exported Expo web app. Always
    // prefer static assets for normal browser navigation when an ASSETS binding
    // is available.
    if ((method === "GET" || method === "HEAD") && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return apiWorker.fetch(request, env, ctx);
  },
};
