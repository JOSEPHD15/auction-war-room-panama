export function normalizedPlayerName(value: string): string {
  return value.trim().toLocaleLowerCase("es");
}

const COMBINING_DIACRITICS_PATTERN = "[\u0300-\u036f]";

/** Accent/case/punctuation-insensitive search key: "Ja'Marr Chase" and "jamarr chase" both become "jamarrchase". */
export function searchKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(new RegExp(COMBINING_DIACRITICS_PATTERN, "g"), "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
