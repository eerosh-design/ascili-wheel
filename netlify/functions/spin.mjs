import { createHmac, timingSafeEqual } from "node:crypto";

/* Prizes are read from the SPIN_PRIZES environment variable (set in Netlify), so no codes are stored in this repo.
   Format: {"spin1":[{"label","code","weight","note"}],"bonus":[...]} */
let PRIZES = null;
function prizes() {
  if (PRIZES) return PRIZES;
  const p = JSON.parse(process.env.SPIN_PRIZES || "null");
  if (!p || !Array.isArray(p.spin1) || !Array.isArray(p.bonus) || !p.spin1.length || !p.bonus.length) throw new Error("SPIN_PRIZES missing");
  PRIZES = p; return p;
}
/* Nairobi time (UTC+3): spin 1 closes end of 30 Nov, bonus end of 12 Dec 2026 */
const SPIN1_CLOSES = Date.parse("2026-11-30T21:00:00Z");
const BONUS_CLOSES = Date.parse("2026-12-12T21:00:00Z");

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const sign = (secret, data) => createHmac("sha256", secret).update(data).digest("base64url");

function pickWeighted(pool, r) {
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let t = r * total;
  for (const p of pool) { t -= p.weight; if (t < 0) return p; }
  return pool[0];
}
function verify(secret, token) {
  if (typeof token !== "string" || token.length > 600) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const good = sign(secret, body);
  const a = Buffer.from(sig), b = Buffer.from(good);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(body, "base64url").toString()); } catch { return null; }
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const secret = process.env.SPIN_SECRET;
  let ready = true; try { prizes(); } catch { ready = false; }
  if (!ready || !secret || secret.length < 16) return json({ error: "The wheel is not set up yet. Please try again soon." }, 500);

  let input;
  try { input = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const now = Date.now();

  if (input.phase === 1) {
    if (now > SPIN1_CLOSES) return json({ error: "The first spin has ended. Thank you for joining us." }, 410);
    const prize = pickWeighted(prizes().spin1, Math.random());
    const body = Buffer.from(JSON.stringify({ p: 1, c: prize.code, iat: now })).toString("base64url");
    const token = body + "." + sign(secret, body);
    return json({ label: prize.label, code: prize.code, note: prize.note, token });
  }

  if (input.phase === 2) {
    if (now > BONUS_CLOSES) return json({ error: "Bonus spins have ended." }, 410);
    const t = verify(secret, input.token);
    if (!t || t.p !== 1) return json({ error: "Please spin the wheel first." }, 403);
    /* Bonus result is derived from the spin-1 token, so asking again always returns the same prize. */
    const h = createHmac("sha256", secret).update("bonus:" + input.token).digest();
    const r = h.readUInt32BE(0) / 4294967296;
    const prize = pickWeighted(prizes().bonus, r);
    return json({ label: prize.label, code: prize.code, note: prize.note });
  }
  return json({ error: "Bad request" }, 400);
};

export const config = { path: "/api/spin" };
