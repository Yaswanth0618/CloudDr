import { AdminCreateUserCommand, AdminSetUserPasswordCommand, CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { authConfig, sameOrigin } from "@/lib/auth";
import { clientAddress, enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
    const config = authConfig();
    await enforceRateLimit("signup-ip", clientAddress(request), 3, 3600);
    await enforceRateLimit("signup-global", "all", 50, 86400);
    if (Number(request.headers.get("content-length")) > 4096) return Response.json({ error: "Signup request is too large." }, { status: 413 });
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = body.password;
    const confirmation = body.confirmation;
    if (name.length < 1 || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof password !== "string" || password.length < 12 || password.length > 128 || password !== confirmation) {
      return Response.json({ error: "Enter your name, a valid email, and matching passwords of at least 12 characters." }, { status: 400 });
    }
    const client = new CognitoIdentityProviderClient({ region: config.region });
    await client.send(new AdminCreateUserCommand({
      UserPoolId: config.poolId,
      Username: email,
      MessageAction: "SUPPRESS",
      UserAttributes: [{ Name: "email", Value: email }, { Name: "name", Value: name }],
    }));
    await client.send(new AdminSetUserPasswordCommand({ UserPoolId: config.poolId, Username: email, Password: password, Permanent: true }));
    return Response.json({ created: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const limited = rateLimitResponse(error);
    if (limited) return limited;
    if (error instanceof Error && error.name === "UsernameExistsException") return Response.json({ error: "An account with this email already exists. Sign in instead." }, { status: 409 });
    if (error instanceof Error && error.name === "InvalidPasswordException") return Response.json({ error: "Choose a stronger password that meets the account policy." }, { status: 400 });
    console.error("Signup failed:", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "Could not create the account. Try again later." }, { status: 503 });
  }
}
