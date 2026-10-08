/**
 * Netlify Function —— 通用数据转发（万能通道入口）
 *
 *   本机 → Netlify(美国俄亥俄) → Vercel(东京 hnd1) → 目标服务
 *
 * 用法：
 *   /api/bn?target=<完整URL编码>&<其余参数>
 *   /api/bn?path=/fapi/v1/klines&symbol=ETHUSDT&interval=1m&limit=1500
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const HOPS = [
  "https://bn-relay-vercel.vercel.app",
  "https://bn-relay-vercel-itsheygfi-fm-2027.vercel.app",
];

const JSON_H = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
};

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

export default async (req) => {
  const url = new URL(req.url);
  const target = url.searchParams.get("target") || "";
  const bnPath = url.searchParams.get("path") || "";

  if (!target && !bnPath) {
    const h = await fetchTimeout(HOPS[0] + "/api/relay", 20000);
    return new Response(JSON.stringify({
      ok: true,
      chain: "you -> netlify(us-east-2) -> vercel(tokyo hnd1) -> target",
      usage: {
        generic: "/api/bn?target=<urlencoded-url>&<params>",
        binance: "/api/bn?path=/fapi/v1/klines&symbol=ETHUSDT&interval=1m&limit=1500",
      },
      examples: [
        "/api/bn?target=" +
          encodeURIComponent("https://www.okx.com/api/v5/market/candles") +
          "&instId=BTC-USDT-SWAP&bar=1m&limit=100",
        "/api/bn?target=" +
          encodeURIComponent("https://www.okx.com/api/v5/public/time"),
      ],
      hops: HOPS,
      hop_ok: h.status === 200,
      hop_ms: h.ms,
    }, null, 2), { headers: JSON_H });
  }

  // 组装给 Vercel 的参数
  const params = new URLSearchParams();
  if (target) params.set("target", target);
  else params.set("path", bnPath);
  for (const [k, v] of url.searchParams.entries()) {
    if (k === "target" || k === "path" || k === "hop") continue;
    params.append(k, v);
  }

  const hopIdx = parseInt(url.searchParams.get("hop") || "0", 10);
  const hopBase = HOPS[Math.min(hopIdx, HOPS.length - 1)] || HOPS[0];
  const hopUrl = hopBase + "/api/relay?" + params.toString();

  const r = await fetchTimeout(hopUrl, 55000);

  if (r.error) {
    return new Response(JSON.stringify({
      chain: "netlify -> vercel(tokyo) -> target",
      hop: hopBase, hop_url: hopUrl, error: r.error,
    }, null, 2), { status: 502, headers: JSON_H });
  }

  return new Response(r.body, {
    status: r.status,
    headers: {
      "Content-Type": r.ctype || "application/json",
      "X-Chain": "netlify -> vercel(tokyo) -> target",
      "X-Hop": hopBase,
      "X-Hop-Ms": String(r.ms || ""),
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
};

export const config = { path: "/api/bn" };
