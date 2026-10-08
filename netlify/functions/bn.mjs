/**
 * Netlify Function —— 币安永续数据转发（双跳）
 *
 *   本机 → Netlify(美国俄亥俄) → Vercel(东京 hnd1) → 币安
 *
 * 用法：
 *   /api/bn?path=/fapi/v1/klines&symbol=ETHUSDT&interval=1m&limit=1500
 *   /api/bn?path=/fapi/v1/ticker/24hr&symbol=BTCUSDT
 *   /api/bn?path=/dapi/v1/time
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Vercel 东京节点（第一个已验证）
const HOPS = [
  "https://bn-relay-vercel.vercel.app",
  "https://bn-relay-vercel-itsheygfi-fm-2027.vercel.app",
];

const ALLOW = ["/fapi/", "/dapi/", "/spot/", "/api/"];

async function fetchTimeout(url, ms = 55000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const t0 = Date.now();
    const r = await fetch(url, {
      signal: ctl.signal,
      headers: {
        "User-Agent": UA,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    const buf = await r.arrayBuffer();
    return { status: r.status, body: buf, ms: Date.now() - t0,
             ctype: r.headers.get("content-type") };
  } catch (e) {
    return { error: e.name + ": " + e.message };
  } finally {
    clearTimeout(timer);
  }
}

const JSON_H = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
};

export default async (req) => {
  const url = new URL(req.url);
  const bnPath = url.searchParams.get("path") || "";

  // 健康检查 / 用法说明
  if (!bnPath) {
    const out = {
      ok: true,
      chain: "you -> netlify(us-east-2) -> vercel(tokyo hnd1) -> binance",
      usage: "/api/bn?path=/fapi/v1/klines&symbol=ETHUSDT&interval=1m&limit=1500",
      hops: HOPS,
      allowed: ALLOW,
    };
    // 顺便验证跳板是否活着
    const h = await fetchTimeout(HOPS[0] + "/api/relay", 20000);
    out.hop_ok = h.status === 200;
    out.hop_ms = h.ms;
    return new Response(JSON.stringify(out, null, 2), { headers: JSON_H });
  }

  if (!ALLOW.some(p => bnPath.startsWith(p))) {
    return new Response(JSON.stringify({
      error: "path not allowed", path: bnPath, allowed: ALLOW,
    }), { status: 403, headers: JSON_H });
  }

  // 其余查询参数原样传给 Vercel
  const params = new URLSearchParams(url.searchParams);
  params.delete("path");
  params.delete("hop");
  params.set("path", bnPath);

  const hopIdx = parseInt(url.searchParams.get("hop") || "0", 10);
  const hopBase = HOPS[Math.min(hopIdx, HOPS.length - 1)] || HOPS[0];
  const target = hopBase + "/api/relay?" + params.toString();

  const r = await fetchTimeout(target, 55000);

  if (r.error) {
    return new Response(JSON.stringify({
      chain: "netlify -> vercel(tokyo) -> binance",
      hop: hopBase, target, error: r.error,
    }, null, 2), { status: 502, headers: JSON_H });
  }

  return new Response(r.body, {
    status: r.status,
    headers: {
      "Content-Type": r.ctype || "application/json",
      "X-Chain": "netlify -> vercel(tokyo) -> binance",
      "X-Hop": hopBase,
      "X-Hop-Ms": String(r.ms || ""),
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
};

export const config = { path: "/api/bn" };
