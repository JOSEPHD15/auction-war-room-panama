import { getDb } from "../../../../../db";
import { managerAccessTokens } from "../../../../../db/schema";

type RegisterBody = { token?: string; label?: string };

/** Registers the reverse lookup (token -> leagueId) so /liga/co/:token can resolve without exposing the leagueId in the URL. The league's own `managers[]` array (embedded in its published state) remains the source of truth for what a token is allowed to do. */
export async function POST(request: Request, { params }: { params: Promise<{ leagueId: string }> }) {
  try {
    const { leagueId } = await params;
    const body = (await request.json()) as RegisterBody;
    if (!body.token || !body.label) return Response.json({ error: "token y label son obligatorios." }, { status: 400 });

    const db = getDb();
    await db.insert(managerAccessTokens).values({ token: body.token, leagueId, label: body.label, createdAt: Date.now() });
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
