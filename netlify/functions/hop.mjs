/**
 * Netlify Function —— 双跳：Netlify(美国) → Vercel(东京) → 币安
 *
 * 本机 → Netlify（可访问）→ Vercel 东京（美国到日本无墙）→ 币安
 *
 * 访问：https://<站点>.netlify.app/api/hop
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const VERcel_HOSTS = [
  "https://bn-relay-vercel.vercel.app",
  "https://bn-relay-vercel-git-main-fm-2027.vercel.app",
  "https://bn-relay-vercel-itsheygfi-fm-2027.vercel.app",
];

// 直接测的币安目标（对照）
const DIRECT = [
  ["直连 fapi time", "https://fapi.binance.com/fapi/v1/time"],
  ["直连 fapi klines", "https://fapi.binance.com/fapi/v1/klines?symbol=ETHUSDT&interval=1m&limit=2"],
];

async function get(url, timeoutMs = 20000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const rec = { url };
  try {
    const t0 = Date.now();
    const r = await fetch(url, {
      signal: ctl.signal,
      headers: { "User-Agent": UA, "Accept": "application/json, text/plain, */*" },
      redirect: "follow",
    });
    rec.status = r.status;
    rec.ms = Date.now() - t0;
    const txt = await r.text();
    rec.bytes = txt.length;
    rec.preview = txt.replace(/\s+/g, " ").slice(0, 300);
    try {
      const j = JSON.parse(txt);
      rec.json = true;
      if (j.verdict) rec.verdict = j.verdict;
      if (j.env) rec.env = j.env;
      if (j.egress) rec.egress = j.egress;
      if (Array.isArray(j.results)) {
        rec.binance = j.results.map(t => ({
          name: t.name, status: t.status,
          mark: t.is_kline ? "KLINE" : (t.has_serverTime ? "TIME" : ""),
          sample: (t.sample || t.preview || t.error || "").slice(0, 80),
        }));
      }
    } catch (e) { rec.json = false; }
  } catch (e) {
    rec.error = e.name + ": " + e.message;
  } finally {
    clearTimeout(timer);
  }
  return rec;
}

export default async () => {
  const out = {
    now: new Date().toISOString(),
    stage: "netlify -> vercel(tokyo) -> binance",
    self: {},
    hop: [],
    direct: [],
  };

  // 自己的出口
  try {
    const r = await fetch("https://ipinfo.io/json", { headers: { "User-Agent": UA } });
    out.self = JSON.parse(await r.text());
  } catch (e) { out.self = { err: e.message }; }

  // 跳 Vercel
  for (const vh of VERcel_HOSTS) {
    const rec = await get(vh + "/api/test", 30000);
    rec.via = vh;
    out.hop.push(rec);
  }

  // 直连币安（对照）
  for (const [name, url] of DIRECT) {
    const rec = await get(url, 15000);
    rec.name = name;
    out.direct.push(rec);
  }

  // 判定
  const klineWin = out.hop.find(h => (h.binance || [])
    .some(b => b.mark === "KLINE" && b.status === 200));
  out.verdict = klineWin
    ? "★★★ 双跳成功！Vercel 东京能取币安 K 线  via " + klineWin.via
    : (out.hop.some(h => h.status === 200)
       ? "Vercel 可达，但币安仍被拒"
       : "Vercel 不可达");

  return new Response(JSON.stringify(out, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
};

export const config = { path: "/api/hop" };
