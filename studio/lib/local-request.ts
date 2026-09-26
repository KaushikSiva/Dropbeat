/** Next may normalize request.url to localhost when the browser uses 127.0.0.1.
 * Compare the browser origin with the actual Host header, never forwarded hosts.
 */
export function sameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return ["http:", "https:"].includes(parsed.protocol) && parsed.host === (request.headers.get("host") || new URL(request.url).host) && parsed.protocol === new URL(request.url).protocol;
  } catch { return false; }
}
