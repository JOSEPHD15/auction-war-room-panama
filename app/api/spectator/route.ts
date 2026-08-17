import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { spectatorSnapshots } from "../../../db/schema";
import { hashPin } from "../../lib/pin";
import { bearerToken, hashSecret, secretsMatch, unauthorized } from "../../lib/serverAuth";

type PublishBody = { spectatorId?: string; leagueId?: string; league?: { updatedAt?: number } & Record<string, unknown>; pin?: string | null; previousSpectatorId?: string | null };

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) return "La tabla de espectadores todavía no existe en D1. Aplica la migración con wrangler d1 execute.";
  return message;
}

/** Admin-only publish/update of a read-only spectator snapshot. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PublishBody;
    if (!body.spectatorId || !body.leagueId || !body.league) return Response.json({ error: "spectatorId, leagueId y league son obligatorios." }, { status: 400 });
    const adminToken = bearerToken(request);
    if (!adminToken) return unauthorized();

    const db = getDb();

    // Retries (from the offline sync queue's backoff) can arrive out of order. Never let a stale snapshot
    // clobber a fresher one that already landed — this is what keeps the queue's ordering guarantee real.
    const [existing] = await db.select().from(spectatorSnapshots).where(eq(spectatorSnapshots.spectatorId, body.spectatorId)).limit(1);
    if (existing) {
      if (existing.adminTokenHash && !(await secretsMatch(adminToken, existing.adminTokenHash))) return unauthorized();
      const existingLeagueUpdatedAt = (JSON.parse(existing.payload) as { updatedAt?: number }).updatedAt ?? 0;
      const incomingLeagueUpdatedAt = body.league.updatedAt ?? 0;
      if (incomingLeagueUpdatedAt < existingLeagueUpdatedAt) return Response.json({ ok: true, skipped: "stale" });
    }

    // `pin` is only present on the request when the admin is explicitly setting/clearing it from the
    // spectator settings panel. Routine background syncs omit it entirely so they never clobber an
    // already-set PIN with null.
    const hasPinField = Object.prototype.hasOwnProperty.call(body, "pin");
    const pinHash = hasPinField ? (body.pin ? await hashPin(body.pin) : null) : null;
    const now = Date.now();
    const publicLeague = { ...body.league };
    delete publicLeague.adminToken;
    const payload = JSON.stringify(publicLeague);

    const adminTokenHash = existing?.adminTokenHash || (await hashSecret(adminToken));
    await db
      .insert(spectatorSnapshots)
      .values({ spectatorId: body.spectatorId, leagueId: body.leagueId, payload, adminTokenHash, pinHash, updatedAt: now })
      .onConflictDoUpdate({ target: spectatorSnapshots.spectatorId, set: { payload, adminTokenHash, updatedAt: now, ...(hasPinField ? { pinHash } : {}) } });

    if (body.previousSpectatorId && body.previousSpectatorId !== body.spectatorId) {
      await db.delete(spectatorSnapshots).where(eq(spectatorSnapshots.spectatorId, body.previousSpectatorId));
    }

    return Response.json({ ok: true, updatedAt: now });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
