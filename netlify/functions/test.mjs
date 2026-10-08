// Netlify Function (v2 格式) —— 出口探测
// 访问：https://<站点>.netlify.app/api/test

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const TARGETS = [
  ["fapi time", "https://fapi.binance.com/fapi/v1/time"],
  ["fapi klines ETH", "https://fapi.binance.com/fapi/v1/klines?symbol=ETHUSDT&interval=1m&limit=2"],
  ["fapi klines BTC", "https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1m&limit=2"],
  ["fapi ticker", "https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=ETHUSDT"],
  ["dapi time", "https://dapi.binance.com/dapi/v1/time"],
  ["spot time", "https://api.binance.com/api/v3/time"],
  ["data-api.vision", "https://data-api.binance.vision/api/v3/time"],
];

async function probe(name, target) {
  const rec = { name, target };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const t0 = Date.now();
    const r = await fetch(target, {
      signal: ctl.signal,
      headers: { "User-Agent": UA, "Accept": "application/json, text/plain, */*" },
    });
    rec.status = r.status;
    rec.ms = Date.now() - t0;
    const buf = await r.arrayBuffer();
    rec.bytes = buf.byteLength;
    const txt = new TextDecoder().decode(buf);
    rec.preview = txt.replace(/\s+/g, " ").slice(0, 200);
    try {
      const j = JSON.parse(txt);
      if (Array.isArray(j) && j.length) {
        rec.is_kline = true;
        rec.sample = JSON.stringify(j[j.length - 1]).slice(0, 150);
      } else if (j && j.serverTime) rec.has_serverTime = true;
    } catch (e) { /* ignore */ }
  } catch (e) {
    rec.error = e.name + ": " + e.message;
  } finally {
    clearTimeout(timer);
  }
  return rec;
}

export default async (req) => {
  const out = {
    platform: "netlify",
    now: new Date().toISOString(),
    runtime: typeof process !== "undefined" ? process.version : "edge",
    egress: {},
    results: [],
  };

  for (const [n, u] of [
    ["ipinfo", "https://ipinfo.io/json"],
    ["ipify", "https://api.ipify.org?format=json"],
  ]) {
    try {
      const r = await fetch(u, { headers: { "User-Agent": UA } });
      out.egress[n] = (await r.text()).slice(0, 300);
    } catch (e) { out.egress[n] = "err:" + e.message; }
  }

  for (const [name, target] of TARGETS) {
    out.results.push(await probe(name, target));
  }

  const wins = out.results.filter(r => r.is_kline || r.has_serverTime);
  out.verdict = wins.length
    ? "★ 可用! " + wins.map(w => w.name).join(", ")
    : "X 全部被拒";

  return new Response(JSON.stringify(out, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
};

export const config = { path: "/api/test" };
