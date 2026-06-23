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
- `app.js` – a kereső interakciói (fülváltás, mezőtörlés)
- `.nojekyll` – kikapcsolja a Jekyll feldolgozást (statikus oldalként szolgáljuk ki)

## 🔎 Funkció

A bal oldali **kereső panel** az OENY Helyrajziszám-kereső felépítését követi:

- **Település** mező
- **Keresés módja** fülek: *Cím* / *Helyrajzi szám*
- találati kártya (cím, HRSZ, bel-/külterület címke, „Tulajdoni lap" link)

> Jelenleg a kereső a felületet (UI) valósítja meg. Az élő adatlekérdezés
> (település- és HRSZ-keresés tényleges adatforrásból) a következő lépés.

## 🛠️ Fejlesztés

A fájlok statikus HTML/CSS/JS állományok, build lépés nélkül. Helyi teszteléshez
elég megnyitni az `index.html`-t a böngészőben, vagy egy egyszerű szervert indítani:

```bash
python3 -m http.server 8000
# majd: http://localhost:8000
```
