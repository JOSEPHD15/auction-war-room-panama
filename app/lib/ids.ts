let counter = 0;

export function makeId(prefix: string): string {
  counter += 1;
  const random = Math.random().toString(36).slice(2, 10);
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${counter}_${random}`;
}

/** Spectator/share links must be genuinely unguessable — always backed by the CSPRNG, never the weak Date.now() fallback. */
export function makeSpectatorId(): string {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") throw new Error("No secure random source available to generate a spectator link.");
  return crypto.randomUUID().replace(/-/g, "");
}
