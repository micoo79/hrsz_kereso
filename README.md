# HRSZ Kereső

Helyrajzi szám (HRSZ) kereső webalkalmazás.

## 🌐 Élő oldal

A weboldal a GitHub Pages-en érhető el:

**https://micoo79.github.io/hrsz_kereso/**

## 🚀 Hogyan frissül az oldal?

Az oldal automatikusan deployolódik a `.github/workflows/deploy.yml` GitHub Actions
workflow segítségével. Minden a `main` ágra történő push után a workflow lefut, és
néhány percen belül frissül az élő oldal.

### Egyszeri beállítás (ha még nincs engedélyezve a Pages)

Ha az első deploy hibára futna, a repó **Settings → Pages** menüpontjában a
**Source** legyen **GitHub Actions**. Ezután a workflow magától deployol.

## 📁 Felépítés

- `index.html` – a webalkalmazás belépő oldala (jelenleg egy Hello World teszt)
- `.github/workflows/deploy.yml` – automatikus deploy GitHub Pages-re
- `.nojekyll` – kikapcsolja a Jekyll feldolgozást (statikus oldalként szolgáljuk ki)

## 🛠️ Fejlesztés

A fájlok statikus HTML/CSS/JS állományok, build lépés nélkül. Helyi teszteléshez
elég megnyitni az `index.html`-t a böngészőben, vagy egy egyszerű szervert indítani:

```bash
python3 -m http.server 8000
# majd: http://localhost:8000
```
