import { randomInt, timingSafeEqual } from "node:crypto";
import { getDatabase } from "@netlify/database";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; /* no 0/O/1/I */
function newCode() {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return "ASC-" + s.slice(0, 4) + "-" + s.slice(4);
}
function cleanCode(v) {
  const s = String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = /^ASC([A-Z0-9]{8})$/.exec(s);
  return m ? "ASC-" + m[1].slice(0, 4) + "-" + m[1].slice(4) : null;
}
const txt = (v, max) => String(v || "").replace(/\s+/g, " ").trim().slice(0, max);
const int = (v) => (Number.isInteger(v) ? v : Number.parseInt(v, 10));

async function view(db, code) {
  const rows = await db.sql`SELECT code, amount, balance, recipient, sender, message, created_at, expires_at, months,
      (expires_at IS NULL) AS inactive,
      (expires_at IS NOT NULL AND expires_at <= NOW()) AS expired FROM vouchers WHERE code = ${code}`;
  if (!rows.length) return null;
  const log = await db.sql`SELECT change, balance_after, note, created_at FROM voucher_log WHERE code = ${code} ORDER BY id DESC LIMIT 20`;
  return { ...rows[0], log };
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const pass = process.env.CHECK_PASSWORD;
  if (!pass) return json({ error: "Not set up yet." }, 500);
  let input;
  try { input = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const a = Buffer.from(String(input.password || "")), b = Buffer.from(pass);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return json({ error: "Wrong password." }, 401);

  const db = getDatabase();
  try {
    if (input.action === "create") {
      const amount = int(input.amount), months = int(input.months || 6);
      if (!(amount >= 500 && amount <= 200000)) return json({ error: "Amount must be between 500 and 200,000." }, 400);
      if (!(months >= 1 && months <= 36)) return json({ error: "Expiry must be 1 to 36 months." }, 400);
      for (let tries = 0; tries < 5; tries++) {
        const code = newCode();
        const rows = await db.sql`INSERT INTO vouchers (code, amount, balance, recipient, sender, message, expires_at)
          VALUES (${code}, ${amount}, ${amount}, ${txt(input.recipient, 60)}, ${txt(input.sender, 60)}, ${txt(input.message, 160)},
                  NOW() + (${months} * INTERVAL '1 month'))
          ON CONFLICT (code) DO NOTHING RETURNING code`;
        if (rows.length) {
          await db.sql`INSERT INTO voucher_log (code, change, balance_after, note) VALUES (${code}, ${amount}, ${amount}, ${"Issued"})`;
          return json({ ok: true, voucher: await view(db, code) });
        }
      }
      return json({ error: "Could not make a unique code. Try again." }, 500);
    }

    if (input.action === "batch") {
      /* Make stock: vouchers with no expiry yet. The 6 months start when one is issued. */
      const items = Array.isArray(input.items) ? input.items : [];
      let total = 0;
      for (const it of items) {
        const amt = int(it && it.amount), n = int(it && it.count);
        if (!(amt >= 500 && amt <= 200000) || !(n >= 1 && n <= 100)) return json({ error: "Each line needs an amount (500 to 200,000) and a count (1 to 100)." }, 400);
        total += n;
      }
      if (!items.length || total > 100) return json({ error: "Make between 1 and 100 vouchers at a time." }, 400);
      const made = [];
      for (const it of items) {
        const amt = int(it.amount), n = int(it.count);
        for (let k = 0; k < n; k++) {
          let done = false;
          for (let tries = 0; tries < 5 && !done; tries++) {
            const c = newCode();
            const rows = await db.sql`WITH ins AS (
                INSERT INTO vouchers (code, amount, balance, recipient, sender, message, expires_at, months)
                VALUES (${c}, ${amt}, ${amt}, '', '', '', NULL, 6) ON CONFLICT (code) DO NOTHING RETURNING code)
              INSERT INTO voucher_log (code, change, balance_after, note)
              SELECT code, ${amt}, ${amt}, 'Made for stock' FROM ins RETURNING code`;
            if (rows.length) { made.push({ amount: amt, code: c }); done = true; }
          }
          if (!done) return json({ error: "Could not make a unique code. Try again.", made }, 500);
        }
      }
      return json({ ok: true, made });
    }

    if (input.action === "stock") {
      const counts = await db.sql`SELECT amount, COUNT(*)::int AS n FROM vouchers WHERE expires_at IS NULL GROUP BY amount ORDER BY amount`;
      const out = { ok: true, stock: counts };
      if (input.list) out.codes = await db.sql`SELECT code, amount FROM vouchers WHERE expires_at IS NULL ORDER BY amount, created_at, code`;
      return json(out);
    }

    if (input.action === "issue") {
      /* Take one unissued voucher of this amount and start its validity now. Two people issuing at once get different vouchers. */
      const amount = int(input.amount);
      if (!(amount >= 500 && amount <= 200000)) return json({ error: "Pick an amount." }, 400);
      const rec = txt(input.recipient, 60), snd = txt(input.sender, 60);
      const msg = txt(input.message, 160) || "Something special for someone special";
      const rows = await db.sql`WITH pick AS (
          SELECT code FROM vouchers WHERE amount = ${amount} AND expires_at IS NULL AND balance = amount
          ORDER BY created_at, code LIMIT 1 FOR UPDATE SKIP LOCKED),
        upd AS (
          UPDATE vouchers v SET expires_at = NOW() + (v.months * INTERVAL '1 month'),
                 recipient = ${rec}, sender = ${snd}, message = ${msg}
          FROM pick WHERE v.code = pick.code RETURNING v.code, v.balance)
        INSERT INTO voucher_log (code, change, balance_after, note)
        SELECT code, 0, balance, 'Issued from stock' FROM upd RETURNING code`;
      if (!rows.length) return json({ error: "No KES " + amount.toLocaleString("en-KE") + " vouchers left in stock. Make more on the Stock tab." }, 409);
      return json({ ok: true, voucher: await view(db, rows[0].code) });
    }

    const code = cleanCode(input.code);
    if (!code) return json({ error: "That does not look like an Ascili voucher code." }, 400);

    if (input.action === "lookup") {
      const v = await view(db, code);
      return v ? json({ ok: true, voucher: v }) : json({ error: "No voucher with that code." }, 404);
    }

    if (input.action === "redeem") {
      const amt = int(input.amount);
      if (!(amt > 0 && amt <= 200000)) return json({ error: "Enter the amount to deduct." }, 400);
      const note = txt(input.note, 80) || "Redeemed";
      /* One statement: deduct only if enough balance and not expired, and log it, so two redemptions can never overspend. */
      const rows = await db.sql`WITH upd AS (
          UPDATE vouchers SET balance = balance - ${amt}
          WHERE code = ${code} AND balance >= ${amt} AND expires_at IS NOT NULL AND expires_at > NOW()
          RETURNING code, balance)
        INSERT INTO voucher_log (code, change, balance_after, note)
        SELECT code, ${-amt}, balance, ${note} FROM upd RETURNING balance_after`;
      const v = await view(db, code);
      if (!v) return json({ error: "No voucher with that code." }, 404);
      if (!rows.length) {
        if (v.inactive) return json({ error: "This voucher has not been issued yet, so it cannot be used.", voucher: v }, 409);
        if (v.expired) return json({ error: "This voucher has expired.", voucher: v }, 409);
        return json({ error: "Not enough balance. Balance is KES " + v.balance.toLocaleString("en-KE") + ".", voucher: v }, 409);
      }
      return json({ ok: true, voucher: v });
    }
    return json({ error: "Bad request" }, 400);
  } catch (e) {
    console.error("voucher error", e && e.message);
    return json({ error: "The voucher register is not ready yet. Please try again shortly." }, 500);
  }
};

export const config = { path: "/api/voucher" };
