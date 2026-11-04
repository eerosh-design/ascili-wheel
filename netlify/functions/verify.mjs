import { timingSafeEqual } from "node:crypto";
import { prizes, json, readRef } from "../lib/prizes.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const secret = process.env.SPIN_SECRET, pass = process.env.CHECK_PASSWORD;
  let ready = true; try { prizes(); } catch { ready = false; }
  if (!ready || !secret || !pass) return json({ error: "Checker not set up yet." }, 500);
  let input;
  try { input = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const a = Buffer.from(String(input.password || "")), b = Buffer.from(pass);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return json({ error: "Wrong password." }, 401);
  const r = readRef(secret, input.ref);
  if (!r) return json({ valid: false });
  return json({
    valid: true,
    spin1: { label: r.spin1.label, code: r.spin1.code, validTo: "30 Nov 2026" },
    bonus: r.bonus ? { label: r.bonus.label, code: r.bonus.code, validTo: "12 Dec 2026" } : null
  });
};

export const config = { path: "/api/verify" };
