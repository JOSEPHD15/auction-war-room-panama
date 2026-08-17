import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { spectatorSnapshots } from "../../../db/schema";
import { hashPin } from "../../lib/pin";

type PublishBody = { spectatorId?: string; leagueId?: string; league?: unknown; pin?: string | null; previousSpectatorId?: string | null };

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) return "La tabla de espectadores todavía no existe en D1. Aplica la migración con wrangler d1 execute.";
  return message;
}

/** Admin-only publish/update of a read-only spectator snapshot. Protected only by knowing the league's own unpredictable spectatorId — there are no accounts yet (Fase 6). */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PublishBody;
    if (!body.spectatorId || !body.leagueId || !body.league) return Response.json({ error: "spectatorId, leagueId y league son obligatorios." }, { status: 400 });

    const db = getDb();
    // `pin` is only present on the request when the admin is explicitly setting/clearing it from the
    // spectator settings panel. Routine background syncs omit it entirely so they never clobber an
    // already-set PIN with null.
    const hasPinField = Object.prototype.hasOwnProperty.call(body, "pin");
    const pinHash = hasPinField ? (body.pin ? await hashPin(body.pin) : null) : null;
    const now = Date.now();
    const payload = JSON.stringify(body.league);

    await db
      .insert(spectatorSnapshots)
      .values({ spectatorId: body.spectatorId, leagueId: body.leagueId, payload, pinHash, updatedAt: now })
      .onConflictDoUpdate({ target: spectatorSnapshots.spectatorId, set: { payload, updatedAt: now, ...(hasPinField ? { pinHash } : {}) } });

    if (body.previousSpectatorId && body.previousSpectatorId !== body.spectatorId) {
      await db.delete(spectatorSnapshots).where(eq(spectatorSnapshots.spectatorId, body.previousSpectatorId));
    }

    return Response.json({ ok: true, updatedAt: now });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
