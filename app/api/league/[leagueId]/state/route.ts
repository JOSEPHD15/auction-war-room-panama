import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { leagueLiveState } from "../../../../../db/schema";

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) return "La tabla league_live_state todavía no existe en D1.";
  return message;
}

/** Fetch the co-authoritative live state. Read access follows the same trust model as the rest of the
 * app: knowing the (unpredictable) leagueId is what gates access, same as spectator links. */
export async function GET(_request: Request, { params }: { params: Promise<{ leagueId: string }> }) {
  try {
    const { leagueId } = await params;
    const db = getDb();
    const [row] = await db.select().from(leagueLiveState).where(eq(leagueLiveState.leagueId, leagueId)).limit(1);
    if (!row) return Response.json({ error: "not_found" }, { status: 404 });
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

    const db = getDb();
    const [existing] = await db.select().from(leagueLiveState).where(eq(leagueLiveState.leagueId, leagueId)).limit(1);

    if (existing && existing.writeVersion !== body.expectedVersion) {
      return Response.json({ error: "conflict", league: JSON.parse(existing.payload), writeVersion: existing.writeVersion }, { status: 409 });
    }

    const writeVersion = body.league.writeVersion ?? 1;
    const now = Date.now();
    const payload = JSON.stringify(body.league);
    await db
      .insert(leagueLiveState)
      .values({ leagueId, payload, writeVersion, updatedAt: now })
      .onConflictDoUpdate({ target: leagueLiveState.leagueId, set: { payload, writeVersion, updatedAt: now } });

    return Response.json({ ok: true, writeVersion });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
