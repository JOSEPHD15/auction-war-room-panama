import { eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { managerAccessTokens } from "../../../../../../db/schema";

/** Revokes a co-manager link immediately — the token stops resolving even before the admin's next full state publish. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ leagueId: string; managerId: string }> }) {
  try {
    const { managerId } = await params;
    const db = getDb();
    await db.delete(managerAccessTokens).where(eq(managerAccessTokens.token, managerId));
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
