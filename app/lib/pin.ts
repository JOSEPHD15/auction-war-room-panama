/** Works in both the browser and the Cloudflare Workers runtime — both expose Web Crypto globally. */
export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin.trim());
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
