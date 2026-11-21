// Прокси Bot API для сервера Repeat: с VPS в РФ api.telegram.org недоступен,
// а Cloudflare доступен. Cloudflare Worker пересылает POST /bot<token>/<method>
// на api.telegram.org и отдаёт ответ как есть.
//
// Защита от чужих: пускаем только с заголовком X-Relay-Key = секрет RELAY_KEY
// (Settings → Variables and Secrets) и только токен нашего бота (BOT_ID —
// цифры до двоеточия в токене). Токен и тела запросов не логируются.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/bot(\d+):[A-Za-z0-9_-]+\/[A-Za-z]+$/);
    const key = request.headers.get("X-Relay-Key") || "";
    if (request.method !== "POST" || !m || !env.RELAY_KEY || !safeEqual(key, env.RELAY_KEY) || (env.BOT_ID && m[1] !== env.BOT_ID)) {
      return new Response("not found", { status: 404 });
    }
    const res = await fetch("https://api.telegram.org" + url.pathname, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
    });
    return new Response(res.body, { status: res.status, headers: { "Content-Type": "application/json" } });
  },
};

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
