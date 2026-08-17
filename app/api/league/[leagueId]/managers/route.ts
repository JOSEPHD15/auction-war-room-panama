import { getDb } from "../../../../../db";
import { leagueLiveState, managerAccessTokens } from "../../../../../db/schema";
import { eq } from "drizzle-orm";
import { authorizeLeague, unauthorized } from "../../../../lib/serverAuth";

type RegisterBody = { token?: string; label?: string };

/** Registers the reverse lookup (token -> leagueId) so /liga/co/:token can resolve without exposing the leagueId in the URL. The league's own `managers[]` array (embedded in its published state) remains the source of truth for what a token is allowed to do. */
export async function POST(request: Request, { params }: { params: Promise<{ leagueId: string }> }) {
  try {
    const { leagueId } = await params;
    const body = (await request.json()) as RegisterBody;
    if (!body.token || !body.label) return Response.json({ error: "token y label son obligatorios." }, { status: 400 });

    const db = getDb();
    const [state] = await db.select().from(leagueLiveState).where(eq(leagueLiveState.leagueId, leagueId)).limit(1);
    if (!state) return Response.json({ error: "Activa primero la colaboración para esta liga." }, { status: 404 });
    const auth = await authorizeLeague(request, leagueId, state.adminTokenHash);
    if (!auth.ok || auth.role !== "admin") return unauthorized();
    await db.insert(managerAccessTokens).values({ token: body.token, leagueId, label: body.label, createdAt: Date.now() });
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
