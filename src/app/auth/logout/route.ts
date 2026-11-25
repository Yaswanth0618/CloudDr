import { NextRequest, NextResponse } from "next/server";
import { authConfig, sameOrigin, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return new Response("Invalid origin.", { status: 403 });
  const config = authConfig();
  const url = new URL("/logout", config.domain);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("logout_uri", config.appOrigin);
  const response = NextResponse.redirect(url, 303);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
