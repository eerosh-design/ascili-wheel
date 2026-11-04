import { createHmac, timingSafeEqual } from "node:crypto";
import { prizes, json, sign, pickIndex, makeRef } from "../lib/prizes.mjs";

/* Nairobi time (UTC+3): spin 1 closes end of 30 Nov, bonus end of 12 Dec 2026 */
const SPIN1_CLOSES = Date.parse("2026-11-30T21:00:00Z");
const BONUS_CLOSES = Date.parse("2026-12-12T21:00:00Z");

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
  const P = prizes();

  if (input.phase === 1) {
    if (now > SPIN1_CLOSES) return json({ error: "The first spin has ended. Thank you for joining us." }, 410);
    const i = pickIndex(P.spin1, Math.random());
    const prize = P.spin1[i];
    const body = Buffer.from(JSON.stringify({ p: 1, i, c: prize.code, iat: now })).toString("base64url");
    const token = body + "." + sign(secret, body);
    return json({ label: prize.label, code: prize.code, note: prize.note, token, ref: makeRef(secret, i, null) });
  }

  if (input.phase === 2) {
    if (now > BONUS_CLOSES) return json({ error: "Bonus spins have ended." }, 410);
    const t = verify(secret, input.token);
    if (!t || t.p !== 1 || !P.spin1[t.i] || P.spin1[t.i].code !== t.c) return json({ error: "Please spin the wheel first." }, 403);
    /* Bonus result is derived from the spin-1 token, so asking again always returns the same prize. */
    const h = createHmac("sha256", secret).update("bonus:" + input.token).digest();
    const j = pickIndex(P.bonus, h.readUInt32BE(0) / 4294967296);
    const prize = P.bonus[j];
    return json({ label: prize.label, code: prize.code, note: prize.note, ref: makeRef(secret, t.i, j) });
  }
  return json({ error: "Bad request" }, 400);
};

export const config = { path: "/api/spin" };
