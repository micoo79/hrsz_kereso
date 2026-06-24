// Cloudflare Worker – CORS proxy az OENY hk-api-hoz.
//
// Miért kell? A GitHub Pages oldal (micoo79.github.io) böngészőből nem hívhatja
// közvetlenül a www.oeny.hu-t, mert az nem küld CORS-engedélyt. Ez a Worker a
// háttérben (szerveroldalon) lekéri az adatot az OENY-től, és CORS-fejléccel
// továbbadja az oldalnak.
//
// Telepítés (ingyenes):
//   1. Regisztrálj: https://dash.cloudflare.com  ->  Workers & Pages.
//   2. Create application -> Create Worker -> illeszd be ezt a kódot -> Deploy.
//   3. A kapott URL pl.: https://hrsz-proxy.SAJAT.workers.dev
//   4. Az app.js-ben:  const PROXY_BASE = "https://hrsz-proxy.SAJAT.workers.dev/?url=";
//
// Biztonság: csak az oeny.hu hk-api kéréseket engedi tovább.

export default {
  async fetch(request) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Preflight kérés.
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const target = new URL(request.url).searchParams.get("url");
    if (!target) {
      return new Response("Hiányzó 'url' paraméter.", { status: 400, headers: corsHeaders });
    }

    // Csak az OENY hk-api engedélyezett.
    let parsed;
    try {
      parsed = new URL(target);
    } catch {
      return new Response("Érvénytelen URL.", { status: 400, headers: corsHeaders });
    }
    if (parsed.hostname !== "www.oeny.hu" || !parsed.pathname.startsWith("/hk-api/")) {
      return new Response("Nem engedélyezett cél.", { status: 403, headers: corsHeaders });
    }

    // Böngészőszerű fejlécek, hogy az OENY ne automatikus botnak vegye a kérést.
    const upstream = await fetch(parsed.toString(), {
      headers: {
        Accept: "application/json",
        "Accept-Language": "hu-HU,hu;q=0.9",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Referer: "https://www.oeny.hu/oeny/hrsz-kereso/",
      },
    });

    const body = await upstream.arrayBuffer();
    return new Response(body, {
      status: upstream.status,
      headers: {
        ...corsHeaders,
        "Content-Type": upstream.headers.get("Content-Type") || "application/json",
      },
    });
  },
};
