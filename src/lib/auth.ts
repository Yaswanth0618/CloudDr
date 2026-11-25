import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";

export const SESSION_COOKIE = "cd_session";
export const STATE_COOKIE = "cd_oauth_state";
export const VERIFIER_COOKIE = "cd_pkce_verifier";

export type Session = { sub: string; email?: string; name?: string };

export function authConfigured() {
  return Boolean(process.env.CLOUD_DROP_REGION && process.env.COGNITO_USER_POOL_ID && process.env.COGNITO_CLIENT_ID && process.env.COGNITO_DOMAIN && process.env.APP_ORIGIN);
}

export function authConfig() {
  const region = process.env.CLOUD_DROP_REGION;
  const poolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_CLIENT_ID;
  const domain = process.env.COGNITO_DOMAIN;
  const appOrigin = process.env.APP_ORIGIN || (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000");
  if (!region || !poolId || !clientId || !domain || !appOrigin) {
    throw new Error("Account sign-in requires CLOUD_DROP_REGION, COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, COGNITO_DOMAIN, and APP_ORIGIN.");
  }
  const domainUrl = new URL(domain);
  const appUrl = new URL(appOrigin);
  if (domainUrl.protocol !== "https:" || domainUrl.pathname !== "/" || domainUrl.search || domainUrl.hash) throw new Error("COGNITO_DOMAIN must be an HTTPS origin.");
  if (process.env.NODE_ENV === "production" && appUrl.protocol !== "https:") throw new Error("APP_ORIGIN must use HTTPS in production.");
  if (appUrl.pathname !== "/" || appUrl.search || appUrl.hash) throw new Error("APP_ORIGIN must be an origin without a path.");
  return { region, poolId, clientId, domain: domainUrl.origin, appOrigin: appUrl.origin, issuer: `https://cognito-idp.${region}.amazonaws.com/${poolId}` };
}

let jwksCache: { issuer: string; keys: ReturnType<typeof createRemoteJWKSet> } | null = null;

export async function sessionFromToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const config = authConfig();
    if (!jwksCache || jwksCache.issuer !== config.issuer) {
      jwksCache = { issuer: config.issuer, keys: createRemoteJWKSet(new URL(`${config.issuer}/.well-known/jwks.json`)) };
    }
    const { payload } = await jwtVerify(token, jwksCache.keys, { issuer: config.issuer, audience: config.clientId });
    if (payload.token_use !== "id" || typeof payload.sub !== "string") return null;
    return { sub: payload.sub, email: typeof payload.email === "string" ? payload.email : undefined, name: typeof payload.name === "string" ? payload.name : undefined };
  } catch {
    return null;
  }
}

export async function sessionFromRequest(request: NextRequest) {
  return sessionFromToken(request.cookies.get(SESSION_COOKIE)?.value);
}

export async function currentSession() {
  const jar = await cookies();
  return sessionFromToken(jar.get(SESSION_COOKIE)?.value);
}

export function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge, state: randomBytes(24).toString("base64url") };
}

export function sameOrigin(request: Request) {
  const sent = request.headers.get("origin");
  if (process.env.NODE_ENV !== "production") return !sent || sent === new URL(request.url).origin;
  const configured = process.env.APP_ORIGIN;
  if (!configured) throw new Error("APP_ORIGIN is required in production.");
  return sent === new URL(configured).origin;
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
