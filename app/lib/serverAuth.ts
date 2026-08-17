import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { managerAccessTokens } from "../../db/schema";

export function bearerToken(request: Request): string | null {
  const value = request.headers.get("authorization");
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice(7).trim();
  return token.length >= 24 ? token : null;
}

export async function hashSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function secretsMatch(provided: string, expectedHash: string): Promise<boolean> {
  const providedHash = await hashSecret(provided);
  const [left, right] = [providedHash, expectedHash].map((value) => new TextEncoder().encode(value));
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function authorizeLeague(request: Request, leagueId: string, adminTokenHash: string): Promise<{ ok: true; label: string; role: "admin" | "co-manager" } | { ok: false }> {
  const token = bearerToken(request);
  if (!token) return { ok: false };
  if (await secretsMatch(token, adminTokenHash)) return { ok: true, label: "Admin", role: "admin" };
  const db = getDb();
  const [manager] = await db.select().from(managerAccessTokens).where(eq(managerAccessTokens.token, token)).limit(1);
  if (!manager || manager.leagueId !== leagueId) return { ok: false };
  return { ok: true, label: manager.label, role: "co-manager" };
}

export function unauthorized(): Response {
  return Response.json({ error: "Acceso no autorizado." }, { status: 401 });
}
