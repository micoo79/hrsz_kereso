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

- `index.html` – a webalkalmazás belépő oldala (jelenleg egy Hello World teszt)
- `.nojekyll` – kikapcsolja a Jekyll feldolgozást (statikus oldalként szolgáljuk ki)

## 🛠️ Fejlesztés

A fájlok statikus HTML/CSS/JS állományok, build lépés nélkül. Helyi teszteléshez
elég megnyitni az `index.html`-t a böngészőben, vagy egy egyszerű szervert indítani:

```bash
python3 -m http.server 8000
# majd: http://localhost:8000
```
