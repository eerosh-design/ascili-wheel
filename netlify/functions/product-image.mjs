import { timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";

const NAME = /^[a-z0-9-]{1,40}$/;
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/* GET /api/product-image/<name>.jpg serves a stored product photo (generic images only, never voucher codes).
   POST {password, name, data} stores one (data = base64 JPEG), team password required. */
export default async (req) => {
  const store = getStore("product-images");
  if (req.method === "GET") {
    const name = new URL(req.url).pathname.split("/").pop().replace(/\.jpg$/, "");
    if (!NAME.test(name)) return new Response("Not found", { status: 404 });
    const buf = await store.get(name, { type: "arrayBuffer" });
    if (!buf) return new Response("Not found", { status: 404 });
    return new Response(buf, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=86400" } });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const pass = process.env.CHECK_PASSWORD;
  if (!pass) return json({ error: "Not set up yet." }, 500);
  let input;
  try { input = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const a = Buffer.from(String(input.password || "")), b = Buffer.from(pass);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return json({ error: "Wrong password." }, 401);
  if (!NAME.test(String(input.name || ""))) return json({ error: "Bad name" }, 400);
  const bytes = Buffer.from(String(input.data || ""), "base64");
  if (bytes.length < 1000 || bytes.length > 400000 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return json({ error: "Send a JPEG under 400 KB." }, 400);
  await store.set(input.name, bytes);
  return json({ ok: true, url: "/api/product-image/" + input.name + ".jpg", bytes: bytes.length });
};

export const config = { path: ["/api/product-image", "/api/product-image/*"] };
