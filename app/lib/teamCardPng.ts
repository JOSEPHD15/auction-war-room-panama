import { money, statsFor } from "./formulas";
import type { League, Team } from "./types";

function renderCardCanvas(league: League, team: Team): HTMLCanvasElement {
  const stats = statsFor(league, team.id);
  const slotIndex = new Map(league.config.slots.map((slot, index) => [slot.id, index]));
  const purchases = league.purchases.filter((purchase) => purchase.teamId === team.id).sort((a, b) => (slotIndex.get(a.slotId) ?? 0) - (slotIndex.get(b.slotId) ?? 0));

  const width = 900;
  const rowHeight = 42;
  const headerHeight = 160;
  const footerHeight = 130;
  const height = headerHeight + Math.max(purchases.length, 1) * rowHeight + footerHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.fillStyle = "#07100d";
  ctx.fillRect(0, 0, width, height);
  const gradient = ctx.createLinearGradient(0, 0, width, headerHeight);
  gradient.addColorStop(0, "#0e1915");
  gradient.addColorStop(1, "#17382b");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, headerHeight);

  ctx.fillStyle = "#8b9c94";
  ctx.font = "600 20px Arial, sans-serif";
  ctx.fillText(league.name.toUpperCase(), 40, 46);

  ctx.fillStyle = "#eef4f0";
  ctx.font = "900 46px Arial, sans-serif";
  ctx.fillText(team.name, 40, 100);

  ctx.fillStyle = "#26d07c";
  ctx.font = "700 16px Arial, sans-serif";
  ctx.fillText(`Temporada ${league.season} · ${league.config.scoring}`, 40, 132);

  let y = headerHeight + 30;
  ctx.font = "600 16px Arial, sans-serif";
  if (purchases.length) {
    purchases.forEach((purchase) => {
      const slot = league.config.slots.find((item) => item.id === purchase.slotId);
      ctx.fillStyle = "#8b9c94";
      ctx.fillText(slot?.label || "", 40, y);
      ctx.fillStyle = "#eef4f0";
      ctx.fillText(purchase.playerName, 140, y);
      ctx.fillStyle = "#e8b84a";
      ctx.textAlign = "right";
      ctx.fillText(money(purchase.price), width - 40, y);
      ctx.textAlign = "left";
      y += rowHeight;
    });
  } else {
    ctx.fillStyle = "#8b9c94";
    ctx.fillText("Sin jugadores todavía.", 40, y);
    y += rowHeight;
  }

  const footerY = y + 30;
  ctx.strokeStyle = "#26342e";
  ctx.beginPath();
  ctx.moveTo(40, footerY - 22);
  ctx.lineTo(width - 40, footerY - 22);
  ctx.stroke();

  ctx.fillStyle = "#8b9c94";
  ctx.font = "600 13px Arial, sans-serif";
  ctx.fillText("GASTADO", 40, footerY);
  ctx.fillText("RESTANTE", width / 2 + 20, footerY);
  ctx.fillStyle = "#eef4f0";
  ctx.font = "900 30px Arial, sans-serif";
  ctx.fillText(money(stats.spent), 40, footerY + 36);
  ctx.fillText(money(stats.remaining), width / 2 + 20, footerY + 36);

  ctx.fillStyle = "#64736b";
  ctx.font = "500 12px Arial, sans-serif";
  ctx.fillText("Auction War Room", 40, height - 18);

  return canvas;
}

/** Downloads (or, when supported, opens the native share sheet for) a neutral PNG summary card for one team. */
export async function shareOrDownloadTeamCard(league: League, team: Team): Promise<void> {
  const canvas = renderCardCanvas(league, team);
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return;
  const filename = `${team.name.replace(/\s+/g, "-").toLowerCase()}-resumen.png`;

  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean; share?: (data: { files: File[]; title?: string }) => Promise<void> };
  if (nav.canShare && nav.share) {
    const file = new File([blob], filename, { type: "image/png" });
    if (nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: `${team.name} — ${league.name}` });
        return;
      } catch {
        // user cancelled the share sheet or it failed — fall back to a plain download
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
