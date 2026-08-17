import { eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { leagueLiveState, managerAccessTokens } from "../../../../../../db/schema";
import { authorizeLeague, unauthorized } from "../../../../../lib/serverAuth";

/** Revokes a co-manager link immediately — the token stops resolving even before the admin's next full state publish. */
export async function DELETE(request: Request, { params }: { params: Promise<{ leagueId: string; managerId: string }> }) {
  try {
    const { leagueId, managerId } = await params;
    const db = getDb();
    const [state] = await db.select().from(leagueLiveState).where(eq(leagueLiveState.leagueId, leagueId)).limit(1);
    if (!state) return Response.json({ error: "not_found" }, { status: 404 });
    const auth = await authorizeLeague(request, leagueId, state.adminTokenHash);
    if (!auth.ok || auth.role !== "admin") return unauthorized();
    await db.delete(managerAccessTokens).where(eq(managerAccessTokens.token, managerId));
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
