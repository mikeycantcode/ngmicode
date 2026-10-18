import "server-only";

export const GOOGLE_COOKIE = "g_oauth";

export function googleEnabled() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** Public origin of this deployment (Railway terminates TLS at a proxy). */
export function publicOrigin(req: Request) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "");
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(req.url).host;
  const proto = h.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return `${proto}://${host}`;
}

export function redirectUri(req: Request) {
  return `${publicOrigin(req)}/api/auth/google/callback`;
}

export function randomToken(bytes = 32) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return Buffer.from(b).toString("base64url");
}

export async function pkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return Buffer.from(digest).toString("base64url");
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
}

/**
 * Exchanges the authorization code for tokens. The ID token comes straight from
 * Google's token endpoint over TLS, so per OIDC Core §3.1.3.7 its signature need
 * not be re-verified; we still check issuer, audience and expiry.
 */
export async function exchangeCode(code: string, verifier: string, redirect: string): Promise<GoogleIdentity> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirect,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed (${res.status})`);
  const { id_token } = (await res.json()) as { id_token?: string };
  if (!id_token) throw new Error("no id_token");
  const claims = JSON.parse(Buffer.from(id_token.split(".")[1], "base64url").toString("utf8")) as Record<string, unknown>;
  if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") throw new Error("bad issuer");
  if (claims.aud !== process.env.GOOGLE_CLIENT_ID) throw new Error("bad audience");
  if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) throw new Error("expired id_token");
  return {
    sub: String(claims.sub),
    email: String(claims.email ?? "").toLowerCase(),
    emailVerified: claims.email_verified === true || claims.email_verified === "true",
    name: String(claims.name ?? claims.email ?? "Google user"),
    picture: typeof claims.picture === "string" ? claims.picture : undefined,
  };
}
