// _callerhash.mjs — telemetry caller hash (AL-AUDIT2-CALLERHASH).
//
// HMAC-SHA256(key = CALLER_HASH_SALT secret, msg = UTC date + ":" + caller IP), cut
// to 64 bits. The key never appears in the repo and the date rotates the hash every
// UTC day, so a hash can't be reversed by trying every IPv4 address, and the same
// caller can't be linked from one day to the next. Daily unique-caller counts work.
//
// With no secret set, the caller is recorded as "unsalted" rather than hashed: an
// unkeyed hash of an IP is reversible, and the old public salt is not a safe default.
// Zero-dep: WebCrypto only (Workers and Node 22).

export const UNSALTED = "unsalted";

export async function callerHash(ip, salt, now = new Date()) {
  if (typeof salt !== "string" || salt.length < 16) return UNSALTED;
  const day = now.toISOString().slice(0, 10);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(salt), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(day + ":" + (ip ?? "")));
  return "hmac:" + Array.from(new Uint8Array(mac)).slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
}
