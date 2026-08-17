import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { managerAccessTokens } from "../../../../db/schema";

/** Resolves a co-manager token to its league, without ever putting the leagueId itself in the URL. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const db = getDb();
    const [row] = await db.select().from(managerAccessTokens).where(eq(managerAccessTokens.token, token)).limit(1);
    if (!row) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ leagueId: row.leagueId, label: row.label });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
