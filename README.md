# HRSZ Kereső

Helyrajzi szám (HRSZ) kereső webalkalmazás.

## 🌐 Élő oldal

A weboldal a GitHub Pages-en érhető el:

**https://micoo79.github.io/hrsz_kereso/**

## 🚀 Hogyan frissül az oldal?

Az oldal a GitHub Pages **„Deploy from a branch”** módjával publikál a `main` ágról.
Minden a `main` ágra történő push után a Pages néhány percen belül automatikusan
újraépíti és frissíti az élő oldalt – nincs szükség külön workflow-ra.

### Egyszeri beállítás

A repó **Settings → Pages → Build and deployment** részén:

- **Source:** Deploy from a branch
- **Branch:** `main` / `/(root)` → Save

## 📁 Felépítés

- `index.html` – a kereső belépő oldala a bal oldali kereső panellel
- `styles.css` – az oldal stílusai (indigókék arculat)
- `app.js` – a kereső logikája és az OENY-lekérdezés
- `cloudflare-worker.js` – opcionális CORS-proxy az OENY-hez (lásd lent)
- `.nojekyll` – kikapcsolja a Jekyll feldolgozást (statikus oldalként szolgáljuk ki)

## 🔎 Funkció és adatforrás

A kereső az **OENY** (`www.oeny.hu/hk-api`) adatait használja:

1. **Település** mező → `hk-api/settlements/search?searchString=…`
   (autocomplete; a kiválasztott településhez tartozik a KSH-kód)
2. **Helyrajzi szám** mező → `hk-api/parcels/search?kshCode=…&lotNumber=…`
3. Találati kártya: cím, HRSZ, bel-/külterület címke és hivatalos
   **„Tulajdoni lap"** link (`magyarorszag.hu`)

## 🔌 CORS-proxy (fontos)

A böngésző a GitHub Pages oldalról biztonsági okból (CORS) nem feltétlenül
hívhatja közvetlenül az `oeny.hu`-t. Az `app.js` ezért így jár el:

1. először **közvetlenül** próbálja az OENY-t,
2. ha a böngésző blokkolja, automatikusan egy **nyilvános proxyn**
   (`allorigins`) keresztül kéri le az adatot.

A nyilvános proxy ingyenes, de lassú/megbízhatatlan lehet. Stabil működéshez
telepítsd a saját, ingyenes **Cloudflare Workert** (lásd `cloudflare-worker.js`),
majd az `app.js` tetején állítsd be:

```js
const PROXY_BASE = "https://hrsz-proxy.SAJAT.workers.dev/?url=";
```

## 🛠️ Fejlesztés

A fájlok statikus HTML/CSS/JS állományok, build lépés nélkül. Helyi teszteléshez
elég megnyitni az `index.html`-t a böngészőben, vagy egy egyszerű szervert indítani:

```bash
python3 -m http.server 8000
# majd: http://localhost:8000
```
