import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { leagueLiveState } from "../../../../../db/schema";
import { applyPurchase, editPurchase, movePurchase, undoLastPurchase } from "../../../../lib/purchaseEngine";
import type { League } from "../../../../lib/types";
import { authorizeLeague, unauthorized } from "../../../../lib/serverAuth";

type OperationBody = {
  operationId?: string;
  expectedVersion?: number;
  operation?:
    | { kind: "purchase"; teamId: string; playerName: string; price: number; slotId?: string }
    | { kind: "edit"; purchaseId: string; patch: { teamId?: string; playerName?: string; price?: number } }
    | { kind: "undo" }
    | { kind: "move"; purchaseId: string; targetSlotId: string };
};

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) return "Las tablas de estado en vivo todavía no existen en D1.";
  return message;
}

/**
 * The single remote entry point both co-managers and the admin (once co-managers exist) use to mutate
 * purchases. Reuses the exact same engine functions as the local/offline path — "validación local,
 * validación remota" with one shared implementation, not two that could drift apart.
 */
export async function POST(request: Request, { params }: { params: Promise<{ leagueId: string }> }) {
  try {
    const { leagueId } = await params;
    const body = (await request.json()) as OperationBody;
    if (!body.operation || !body.operationId || typeof body.expectedVersion !== "number") {
      return Response.json({ error: "operation, operationId y expectedVersion son obligatorios." }, { status: 400 });
    }

    const db = getDb();
    const [row] = await db.select().from(leagueLiveState).where(eq(leagueLiveState.leagueId, leagueId)).limit(1);
    if (!row) return Response.json({ error: "El modo co-manager no está activo para esta liga." }, { status: 404 });

    const league = JSON.parse(row.payload) as League;
    const auth = await authorizeLeague(request, leagueId, row.adminTokenHash);
    if (!auth.ok) return unauthorized();
    const updatedBy = auth.label;

    if (row.writeVersion !== body.expectedVersion) {
      return Response.json({ error: "conflict", league, writeVersion: row.writeVersion }, { status: 409 });
    }

    const operation = body.operation;
    const result =
      operation.kind === "purchase"
        ? applyPurchase(league, { teamId: operation.teamId, playerName: operation.playerName, price: operation.price, slotId: operation.slotId }, body.operationId, updatedBy)
        : operation.kind === "edit"
          ? editPurchase(league, operation.purchaseId, operation.patch, body.operationId, updatedBy)
          : operation.kind === "undo"
            ? undoLastPurchase(league, body.operationId, updatedBy)
            : operation.kind === "move"
              ? movePurchase(league, operation.purchaseId, operation.targetSlotId, body.operationId, updatedBy)
              : null;

    if (!result) return Response.json({ error: "Tipo de operación desconocido." }, { status: 400 });
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });

    const now = Date.now();
    const updatedRows = await db
      .update(leagueLiveState)
      .set({ payload: JSON.stringify(result.league), writeVersion: result.league.writeVersion, updatedAt: now })
      .where(and(eq(leagueLiveState.leagueId, leagueId), eq(leagueLiveState.writeVersion, body.expectedVersion)))
      .returning({ writeVersion: leagueLiveState.writeVersion });

    if (!updatedRows.length) {
      const [fresh] = await db.select().from(leagueLiveState).where(eq(leagueLiveState.leagueId, leagueId)).limit(1);
      if (!fresh) return Response.json({ error: "not_found" }, { status: 404 });
      return Response.json({ error: "conflict", league: JSON.parse(fresh.payload), writeVersion: fresh.writeVersion }, { status: 409 });
    }

    return Response.json({ ok: true, league: result.league, writeVersion: result.league.writeVersion });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
