import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authConfig, cookieOptions, sessionFromToken, SESSION_COOKIE, STATE_COOKIE, VERIFIER_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const config = authConfig();
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  const verifier = request.cookies.get(VERIFIER_COOKIE)?.value;
  const errorResponse = NextResponse.redirect(new URL("/auth/error", config.appOrigin));
  errorResponse.cookies.delete(STATE_COOKIE);
  errorResponse.cookies.delete(VERIFIER_COOKIE);
  if (!code || !state || !expectedState || !verifier || state.length !== expectedState.length || !timingSafeEqual(Buffer.from(state), Buffer.from(expectedState))) return errorResponse;

  try {
    const tokenUrl = new URL("/oauth2/token", config.domain);
    const body = new URLSearchParams({ grant_type: "authorization_code", client_id: config.clientId, code, redirect_uri: `${config.appOrigin}/auth/callback`, code_verifier: verifier });
    const exchanged = await fetch(tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
    if (!exchanged.ok) return errorResponse;
    const tokens = await exchanged.json() as { id_token?: string };
    const session = await sessionFromToken(tokens.id_token);
    if (!session || !tokens.id_token) return errorResponse;
    const response = NextResponse.redirect(new URL("/", config.appOrigin));
    response.cookies.set(SESSION_COOKIE, tokens.id_token, { ...cookieOptions, maxAge: 3600 });
    response.cookies.delete(STATE_COOKIE);
    response.cookies.delete(VERIFIER_COOKIE);
    return response;
  } catch {
    return errorResponse;
  }
}
