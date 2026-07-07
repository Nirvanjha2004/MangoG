/**
 * API client for communicating with the backend.
 *
 * In development (`vite dev`), requests go to the Vite proxy at `localhost:3001`.
 * In production (Vercel), set `VITE_API_URL` to your Render backend URL,
 * e.g. `https://your-app.onrender.com`.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? "";

/**
 * Returns a fully-qualified URL for the given API path.
 */
export function apiUrl(path: string): string {
  // Ensure there's exactly one slash between base and path
  const base = API_BASE.replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

/**
 * Thin wrapper around `fetch` that automatically prefixes the API base URL.
 */
export async function apiFetch(
  path: string,
  options?: RequestInit,
): Promise<Response> {
  return fetch(apiUrl(path), options);
}
