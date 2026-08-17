import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { leagueLiveState } from "../../../../../db/schema";
import { authorizeLeague, bearerToken, hashSecret, unauthorized } from "../../../../lib/serverAuth";

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) return "La tabla league_live_state todavía no existe en D1.";
  return message;
}

/** Fetch the co-authoritative live state for an authenticated admin or co-manager. */
export async function GET(request: Request, { params }: { params: Promise<{ leagueId: string }> }) {
  try {
    const { leagueId } = await params;
    const db = getDb();
    const [row] = await db.select().from(leagueLiveState).where(eq(leagueLiveState.leagueId, leagueId)).limit(1);
    if (!row) return Response.json({ error: "not_found" }, { status: 404 });
    const auth = await authorizeLeague(request, leagueId, row.adminTokenHash);
    if (!auth.ok) return unauthorized();
    return Response.json({ league: JSON.parse(row.payload), writeVersion: row.writeVersion });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

type PutBody = { league?: { writeVersion?: number } & Record<string, unknown>; expectedVersion?: number };

/** Admin-only whole-state publish (config/status changes, or the initial activation of co-manager mode).
 * Version-checked so it can never blindly clobber a purchase a co-manager just made through /operations. */
export async function PUT(request: Request, { params }: { params: Promise<{ leagueId: string }> }) {
  try {
    const { leagueId } = await params;
    const body = (await request.json()) as PutBody;
    if (!body.league) return Response.json({ error: "league es obligatorio." }, { status: 400 });
    const adminToken = bearerToken(request);
    if (!adminToken) return unauthorized();

    const db = getDb();
    const [existing] = await db.select().from(leagueLiveState).where(eq(leagueLiveState.leagueId, leagueId)).limit(1);

    if (existing?.adminTokenHash) {
      const auth = await authorizeLeague(request, leagueId, existing.adminTokenHash);
      if (!auth.ok || auth.role !== "admin") return unauthorized();
    }

    if (existing && existing.writeVersion !== body.expectedVersion) {
      return Response.json({ error: "conflict", league: JSON.parse(existing.payload), writeVersion: existing.writeVersion }, { status: 409 });
    }

    const writeVersion = body.league.writeVersion ?? 1;
    const now = Date.now();
    const remoteLeague = { ...body.league };
    delete remoteLeague.adminToken;
    const payload = JSON.stringify(remoteLeague);
    const adminTokenHash = existing?.adminTokenHash || (await hashSecret(adminToken));
    if (existing) {
      const rows = await db
        .update(leagueLiveState)
        .set({ payload, adminTokenHash, writeVersion, updatedAt: now })
        .where(and(eq(leagueLiveState.leagueId, leagueId), eq(leagueLiveState.writeVersion, body.expectedVersion ?? -1)))
        .returning({ writeVersion: leagueLiveState.writeVersion });
      if (!rows.length) {
        const [fresh] = await db.select().from(leagueLiveState).where(eq(leagueLiveState.leagueId, leagueId)).limit(1);
        return Response.json({ error: "conflict", league: fresh ? JSON.parse(fresh.payload) : null, writeVersion: fresh?.writeVersion ?? 0 }, { status: 409 });
      }
    } else {
      await db.insert(leagueLiveState).values({ leagueId, payload, adminTokenHash, writeVersion, updatedAt: now });
    }

    return Response.json({ ok: true, writeVersion });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
