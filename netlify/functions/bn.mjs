/**
 * Netlify Function —— 币安永续数据转发（双跳）
 *
 *   本机 → Netlify(美国) → Vercel(东京) → 币安
 *
 * 用法：
 *   /api/bn?path=/fapi/v1/klines&symbol=ETHUSDT&interval=1m&limit=1500
 *   /api/bn?path=/fapi/v1/ticker/24hr&symbol=BTCUSDT
 *   /api/bn?path=/dapi/v1/time
 *   /api/bn?path=/api/v3/klines&symbol=BTCUSDT&interval=1m&limit=100
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Vercel 东京节点的候选域名（第一个已验证可用）
const HOPS = [
  "https://bn-relay-vercel.vercel.app",
  "https://bn-relay-vercel-itsheygfi-fm-2027.vercel.app",
];

// 允许的币安路径前缀
const ALLOW = [
  "/fapi/",     // USDT 本位合约
  "/dapi/",     // 币本位合约
  "/api/",      // 现货（经 spot 段）
  "/spot/",
];

async function fetchTimeout(url, ms = 45000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const t0 = Date.now();
    const r = await fetch(url, {
      signal: ctl.signal,
      headers: {
        "User-Agent": UA,
        "Accept": "application/json, text/plain, */*",
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

  // 健康检查
  if (url.pathname === "/api/bn" && !url.searchParams.get("path")) {
    return new Response(JSON.stringify({
      ok: true,
      usage: "/api/bn?path=/fapi/v1/klines&symbol=ETHUSDT&interval=1m&limit=1500",
      chain: "you -> netlify(us) -> vercel(tokyo) -> binance",
      hops: HOPS,
      allowed: ALLOW,
    }, null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8",
                 "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
    });
  }

  const bnPath = url.searchParams.get("path") || "";
  if (!ALLOW.some(p => bnPath.startsWith(p))) {
    return new Response(JSON.stringify({
      error: "path not allowed", path: bnPath, allowed: ALLOW,
    }), { status: 403, headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*" } });
  }

  // 组装币安的查询串（去掉 path 参数）
  const qs = new URLSearchParams(url.searchParams);
  qs.delete("path");
  qs.delete("hop");
  const query = qs.toString();

  // 选定跳板
  const hopIdx = parseInt(url.searchParams.get("hop") || "0", 10);
  const hopBase = HOPS[Math.min(hopIdx, HOPS.length - 1)] || HOPS[0];

  // Vercel 的透传路径：/fapi/* → fapi.binance.com/fapi/*
  //   /api/*   → api.binance.com/api/*
  //   /dapi/*  → dapi.binance.com/dapi/*
  let vPath = bnPath;
  if (bnPath.startsWith("/spot/")) vPath = "/spot/" + bnPath.slice(6);

  const target = hopBase + vPath + (query ? "?" + query : "");

  const r = await fetchTimeout(target, 45000);

  const meta = {
    chain: "netlify -> vercel(tokyo) -> binance",
    hop: hopBase,
    target,
    upstream_ms: r.ms,
    upstream_status: r.status,
  };

  if (r.error) {
    return new Response(JSON.stringify({ ...meta, error: r.error }, null, 2),
      { status: 502, headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
  }

  return new Response(r.body, {
    status: r.status,
    headers: {
      "Content-Type": r.ctype || "application/json",
      "X-Chain": meta.chain,
      "X-Hop": hopBase,
      "X-Upstream-Ms": String(r.ms || ""),
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
};

export const config = { path: "/api/bn" };
