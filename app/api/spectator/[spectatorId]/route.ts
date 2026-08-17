import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { spectatorSnapshots } from "../../../../db/schema";
import { hashPin } from "../../../lib/pin";
import { bearerToken, secretsMatch, unauthorized } from "../../../lib/serverAuth";

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) return "La tabla de espectadores todavía no existe en D1.";
  return message;
}

/** Read-only fetch for the /draft/:spectatorId view. Never returns pinHash, and never returns the payload unless the PIN (when set) checks out server-side. */
export async function GET(request: Request, { params }: { params: Promise<{ spectatorId: string }> }) {
  try {
    const { spectatorId } = await params;
    const db = getDb();
    const [row] = await db.select().from(spectatorSnapshots).where(eq(spectatorSnapshots.spectatorId, spectatorId)).limit(1);
    if (!row) return Response.json({ error: "not_found" }, { status: 404 });

    if (row.pinHash) {
      const pin = new URL(request.url).searchParams.get("pin");
      if (!pin) return Response.json({ error: "pin_required" }, { status: 401 });
      const submittedHash = await hashPin(pin);
      if (submittedHash !== row.pinHash) return Response.json({ error: "pin_invalid" }, { status: 403 });
    }

    return Response.json({ league: JSON.parse(row.payload), updatedAt: row.updatedAt });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

/** Used when the admin disables spectator mode entirely (not for routine regeneration — that's handled by POST's previousSpectatorId cleanup). */
export async function DELETE(request: Request, { params }: { params: Promise<{ spectatorId: string }> }) {
  try {
    const { spectatorId } = await params;
    const db = getDb();
    const [row] = await db.select().from(spectatorSnapshots).where(eq(spectatorSnapshots.spectatorId, spectatorId)).limit(1);
    if (!row) return Response.json({ ok: true });
    const token = bearerToken(request);
    if (!token || !row.adminTokenHash || !(await secretsMatch(token, row.adminTokenHash))) return unauthorized();
    await db.delete(spectatorSnapshots).where(eq(spectatorSnapshots.spectatorId, spectatorId));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
