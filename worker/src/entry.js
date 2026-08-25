import apiWorker from "./index.js";

const API_GET_ROUTES = new Set(["/health", "/privacy", "/support"]);
const API_WRITE_ROUTES = new Set(["/scan", "/events", "/feedback"]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    // Keep Tavue API and policy/support endpoints on the API worker.
    if (
      API_GET_ROUTES.has(url.pathname) ||
      API_WRITE_ROUTES.has(url.pathname) ||
      method === "OPTIONS"
    ) {
      return apiWorker.fetch(request, env, ctx);
    }

    // The custom domain serves both the Tavue web app and API. Always prefer
    // the exported Expo web assets for normal browser navigation, even if the
    // request reaches the Worker because of a Cloudflare route/domain change.
    if ((method === "GET" || method === "HEAD") && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return apiWorker.fetch(request, env, ctx);
  },
};
