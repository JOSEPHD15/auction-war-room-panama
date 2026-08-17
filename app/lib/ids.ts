let counter = 0;

export function makeId(prefix: string): string {
  counter += 1;
  const random = Math.random().toString(36).slice(2, 10);
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${counter}_${random}`;
}
