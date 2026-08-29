/**
 * React -> Google Apps Script Web App API bridge for DSCE / PPG Training Portal Dashboard.
 * Includes client-side request deduplication and caching for instant navigation.
 */

const VITE_APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL;

function getApiUrl() {
  if (
    !VITE_APPS_SCRIPT_URL ||
    VITE_APPS_SCRIPT_URL.includes("YOUR_DSCE_DEPLOYMENT_ID")
  ) {
    return null;
  }
  // In Vite dev mode, route through /api-proxy to bypass local CORS preflight restrictions
  if (
    import.meta.env.DEV &&
    VITE_APPS_SCRIPT_URL.startsWith("https://script.google.com")
  ) {
    return VITE_APPS_SCRIPT_URL.replace(
      "https://script.google.com",
      "/api-proxy",
    );
  }
  return VITE_APPS_SCRIPT_URL;
}

// In-memory cache for fast read operations
const apiCache = new Map();
const CACHE_TTL_MS = 20_000; // 20 seconds cache for identical queries

// Cacheable read-only action names
const CACHEABLE_ACTIONS = new Set([
  "getDepartmentList",
  "getTrainingDayStatus",
  "getTestBlocks",
  "getAllStudentsCount",
  "getDashboardData",
  "getDashboardStudentRankings",
  "getStudentProfile"
]);

export function clearApiCache() {
  apiCache.clear();
}

export async function callServer(action, ...args) {
  const targetUrl = getApiUrl();
  if (!targetUrl) {
    throw new Error(
      "Apps Script API URL is missing or unconfigured. Please set VITE_APPS_SCRIPT_URL in .env.local to your live Google Apps Script Web App /exec URL.",
    );
  }

  // Check cache for read-only actions
  const isCacheable = CACHEABLE_ACTIONS.has(action);
  const cacheKey = isCacheable ? `${action}_${JSON.stringify(args)}` : null;

  if (isCacheable && apiCache.has(cacheKey)) {
    const cached = apiCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
    apiCache.delete(cacheKey);
  }

  // Mutating action -> clear cache to keep data synchronized
  if (!isCacheable && action.startsWith("save") || action.startsWith("add") || action.startsWith("remove")) {
    clearApiCache();
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        action,
        args,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error(
          "HTTP 401 Unauthorized: Your Google Apps Script Web App deployment is restricting access. In Apps Script Editor, go to Deploy > Manage Deployments > Edit and set 'Who has access' to 'Anyone', then deploy a New Version.",
        );
      }
      throw new Error(`API request failed (${response.status}).`);
    }

    const result = await response.json();

    if (result?.success === false && result?.message) {
      if (action === "login" || action === "validateSession") {
        return result;
      }

      const error = new Error(result.message);
      error.code =
        result.message === "SESSION_EXPIRED" ? "SESSION_EXPIRED" : undefined;
      error.locked = result.locked;

      throw error;
    }

    // Save to cache if successful
    if (isCacheable && result?.success) {
      apiCache.set(cacheKey, { timestamp: Date.now(), data: result });
    }

    return result;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(
        "Request timed out. Please check network connection and try again.",
      );
    }
    if (error?.message === "Failed to fetch" || error?.name === "TypeError") {
      throw new Error(
        "Connection Error (CORS / Failed to fetch): Please ensure your Apps Script deployment setting is set to 'Who has access: Anyone' and restart the dev server.",
      );
    }
    console.error(`Apps Script API error [${action}]`, error);
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
