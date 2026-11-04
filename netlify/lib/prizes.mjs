import { createHmac, timingSafeEqual } from "node:crypto";

/* Prizes are read from the SPIN_PRIZES environment variable (set in Netlify), so no codes are stored in this repo.
   Format: {"spin1":[{"label","code","weight","note"}],"bonus":[...]}
   Do not reorder the lists once the wheel is live: claim references use list positions. */
let PRIZES = null;
export function prizes() {
  if (PRIZES) return PRIZES;
  const p = JSON.parse(process.env.SPIN_PRIZES || "null");
  if (!p || !Array.isArray(p.spin1) || !Array.isArray(p.bonus) || !p.spin1.length || !p.bonus.length) throw new Error("SPIN_PRIZES missing");
  PRIZES = p; return p;
}
export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
export const sign = (secret, data) => createHmac("sha256", secret).update(data).digest("base64url");
export function pickIndex(pool, r) {
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let t = r * total;
  for (let i = 0; i < pool.length; i++) { t -= pool[i].weight; if (t < 0) return i; }
  return 0;
}
/* Claim reference: "<spin1 position>-<bonus position or 0>-<8 hex check>" */
const mac = (secret, c1, c2) => createHmac("sha256", secret).update("ref:" + c1 + "|" + (c2 || "")).digest("hex").slice(0, 8).toUpperCase();
export function makeRef(secret, i, j) {
  const P = prizes();
  return (i + 1) + "-" + (j === null ? 0 : j + 1) + "-" + mac(secret, P.spin1[i].code, j === null ? "" : P.bonus[j].code);
}
export function readRef(secret, ref) {
  const m = /^(\d{1,2})-(\d{1,2})-([0-9A-F]{8})$/.exec(String(ref || "").trim().toUpperCase());
  if (!m) return null;
  const P = prizes(), i = +m[1] - 1, j = +m[2] - 1;
  if (!P.spin1[i] || (j >= 0 && !P.bonus[j])) return null;
  const good = mac(secret, P.spin1[i].code, j >= 0 ? P.bonus[j].code : "");
  const a = Buffer.from(m[3]), b = Buffer.from(good);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { spin1: P.spin1[i], bonus: j >= 0 ? P.bonus[j] : null };
}
