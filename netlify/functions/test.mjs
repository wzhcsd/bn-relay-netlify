// Netlify Function —— 币安连通性测试
// 访问：https://<你的站点>.netlify.app/api/test

export default async (req, context) => {
  const BROWSER_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  const TARGETS = [
    ["fapi/v1/time", "https://fapi.binance.com/fapi/v1/time"],
    ["fapi klines ETH", "https://fapi.binance.com/fapi/v1/klines?symbol=ETHUSDT&interval=1m&limit=2"],
    ["fapi klines BTC", "https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1m&limit=2"],
    ["fapi ticker", "https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=ETHUSDT"],
    ["dapi/v1/time", "https://dapi.binance.com/dapi/v1/time"],
    ["api.binance.com", "https://api.binance.com/api/v3/time"],
    ["data-api.vision", "https://data-api.binance.vision/api/v3/time"],
    ["vision archive", "https://data.binance.vision/data/futures/um/daily/klines/ETHUSDT/1m/ETHUSDT-1m-2026-10-07.zip"],
    ["ipify", "https://api.ipify.org?format=json"],
    ["ipinfo", "https://ipinfo.io/json"],
    ["OKX（对照）", "https://www.okx.com/api/v5/public/time"],
    ["MEXC（对照）", "https://api.mexc.com/api/v3/time"],
  ];

  async function probe(name, target) {
    const rec = { name, target };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const t0 = Date.now();
      const r = await fetch(target, {
        signal: ctl.signal,
        headers: {
          "User-Agent": BROWSER_UA,
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      rec.status = r.status;
      rec.ms = Date.now() - t0;
      rec.ctype = r.headers.get("content-type");
      const buf = await r.arrayBuffer();
      rec.bytes = buf.byteLength;
      rec.preview = new TextDecoder().decode(buf.slice(0, 240)).replace(/\s+/g, " ");
      try {
        const j = JSON.parse(new TextDecoder().decode(buf));
        if (Array.isArray(j) && j.length) {
          rec.parsed = "array";
          rec.sample = JSON.stringify(j[j.length - 1]).slice(0, 150);
          if (Array.isArray(j[0]) && j[0].length > 5) rec.is_kline = true;
        } else if (j && typeof j === "object") {
          rec.parsed = "object";
          if (j.serverTime) rec.has_serverTime = true;
        }
      } catch (e) { /* not json */ }
    } catch (e) {
      rec.error = e.name + ": " + e.message;
    } finally {
      clearTimeout(timer);
    }
    return rec;
  }

  const results = [];
  for (const [name, target] of TARGETS) {
    results.push(await probe(name, target));
  }

  return new Response(JSON.stringify({
    ok: true,
    platform: "netlify-functions",
    runtime: `node ${process.version}`,
    region: process.env.AWS_REGION || context?.geo?.country || "unknown",
    now: new Date().toISOString(),
    results,
  }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
};

export const config = { path: "/api/test" };
