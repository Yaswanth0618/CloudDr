import { NextResponse } from "next/server";
import { authConfig, cookieOptions, pkcePair, STATE_COOKIE, VERIFIER_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const config = authConfig();
    const { verifier, challenge, state } = pkcePair();
    const url = new URL("/oauth2/authorize", config.domain);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", `${config.appOrigin}/auth/callback`);
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    const response = NextResponse.redirect(url);
    response.cookies.set(STATE_COOKIE, state, { ...cookieOptions, maxAge: 600 });
    response.cookies.set(VERIFIER_COOKIE, verifier, { ...cookieOptions, maxAge: 600 });
    return response;
  } catch {
    return new Response("Sign-in is not configured.", { status: 503 });
  }
}
