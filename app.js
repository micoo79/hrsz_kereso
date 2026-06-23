// Helyrajziszám-kereső – OENY adatforrásra épülő lekérdezés.
//
// Folyamat:
//   1. Település mező  -> hk-api/settlements/search?searchString=...
//      A kiválasztott településhez tartozik egy KSH-kód (kshCode).
//   2. Helyrajzi szám  -> hk-api/parcels/search?kshCode=...&lotNumber=...
//
// CORS: a böngésző a GitHub Pages oldalról nem feltétlenül hívhatja közvetlenül
// az oeny.hu-t. Ezért a kérés először KÖZVETLENÜL próbálkozik, és ha a böngésző
// blokkolja, automatikusan egy proxyn keresztül megy. Saját, stabil proxyhoz
// állítsd be a PROXY_BASE értékét a lent leírt Cloudflare Workerre.

(function () {
  "use strict";

  // ---- Konfiguráció ----
  const OENY_BASE = "https://www.oeny.hu/hk-api";

  // Google Maps JavaScript API kulcs. Ha meg van adva, interaktív térkép
  // jelenik meg HÚZHATÓ sárga emberkével (Pegman) és Street View-val.
  // Üresen hagyva a kulcs nélküli, beágyazott térkép (Térkép/Utcakép) marad.
  const MAPS_API_KEY = "AIzaSyA5uLO0P95p8W9ASEWASG3A9m_6y5kgNK4";

  // Ha beállítasz saját Cloudflare Workert (lásd cloudflare-worker.js + README),
  // írd ide az URL-jét. Üresen hagyva a nyilvános proxyk a tartalék.
  const PROXY_BASE = "https://hrszkereso.micoo79.workers.dev/?url=";

  // A próbálkozási sorrend: saját proxy (ha van) -> közvetlen -> nyilvános proxyk.
  // Több nyilvános proxy is szerepel tartaléknak, mert ezek egyenként
  // megbízhatatlanok lehetnek; ha az egyik nem elérhető, jön a következő.
  const PROXY_CHAIN = [
    PROXY_BASE ? (url) => PROXY_BASE + encodeURIComponent(url) : null,
    (url) => url, // közvetlen (akkor működik, ha az OENY enged CORS-t)
    (url) => "https://corsproxy.io/?url=" + encodeURIComponent(url),
    (url) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(url),
    (url) => "https://thingproxy.freeboard.io/fetch/" + url,
  ].filter(Boolean);

  // Az a proxy-index, amelyik utoljára működött (gyorsítótár).
  let workingProxy = null;

  // ---- Segédfüggvények ----

  // Lekér egy OENY-útvonalat, végigpróbálva a proxy-láncot.
  async function fetchOeny(path) {
    const fullUrl = OENY_BASE + path;
    const order =
      workingProxy === null
        ? PROXY_CHAIN.map((_, i) => i)
        : [workingProxy, ...PROXY_CHAIN.map((_, i) => i).filter((i) => i !== workingProxy)];

    let lastError;
    for (const i of order) {
      try {
        const res = await fetch(PROXY_CHAIN[i](fullUrl), {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        workingProxy = i; // jegyezzük meg a működő utat
        return data;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error("Ismeretlen hiba");
  }

  // Az első létező, nem üres mezőt adja vissza a megadott kulcsok közül.
  function pick(obj, keys, fallback) {
    if (!obj) return fallback;
    for (const k of keys) {
      if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
    }
    return fallback;
  }

  // A különböző lehetséges válaszformákból kibontja a listát.
  function toList(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.content)) return data.content;
    if (data && Array.isArray(data.results)) return data.results;
    if (data && Array.isArray(data.items)) return data.items;
    if (data && Array.isArray(data.data)) return data.data;
    return [];
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function debounce(fn, wait) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // ---- DOM elemek ----
  const settlementInput = document.getElementById("settlement");
  const settlementList = document.getElementById("settlement-list");
  const lotInput = document.getElementById("lotNumber");
  const lotList = document.getElementById("lot-list");
  const results = document.getElementById("results");
  const resultsTitle = document.getElementById("results-title");
  const resultsList = document.getElementById("results-list");
  const statusMessage = document.getElementById("status-message");
  const mapFrame = document.getElementById("map-frame");
  const mapPlaceholder = document.getElementById("map-placeholder");
  const mapToggle = document.getElementById("map-toggle");
  const svButton = document.getElementById("sv-btn");
  const mapCanvas = document.getElementById("gmap");

  // A kiválasztott település (név + KSH-kód).
  let selectedSettlement = null;

  // ---- Állapotüzenetek ----
  function showStatus(text, isError) {
    statusMessage.textContent = text;
    statusMessage.classList.toggle("is-error", !!isError);
    statusMessage.hidden = false;
  }
  function hideStatus() {
    statusMessage.hidden = true;
  }

  // ---- Település autocomplete ----
  function renderSettlementSuggestions(items) {
    settlementList.innerHTML = "";
    if (!items.length) {
      settlementList.innerHTML = '<li class="empty">Nincs találat</li>';
      settlementList.hidden = false;
      return;
    }
    items.forEach((item) => {
      const name = pick(item, ["name", "settlementName", "telepulesNev", "telepules", "label"], "");
      const county = pick(item, ["county", "countyName", "megye", "megyeNev"], "");
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.innerHTML = escapeHtml(name) + (county ? "<small>" + escapeHtml(county) + "</small>" : "");
      li.addEventListener("click", () => selectSettlement(item, name));
      settlementList.appendChild(li);
    });
    settlementList.hidden = false;
    settlementInput.setAttribute("aria-expanded", "true");
  }

  function selectSettlement(item, name) {
    selectedSettlement = {
      name: name,
      kshCode: pick(item, ["kshCode", "kshKod", "ksh", "code", "id"], ""),
      raw: item,
    };
    settlementInput.value = name;
    settlementList.hidden = true;
    settlementInput.setAttribute("aria-expanded", "false");
    hideStatus();
    lotInput.focus();
  }

  const searchSettlements = debounce(async function () {
    const term = settlementInput.value.trim();
    selectedSettlement = null;
    if (term.length < 2) {
      settlementList.hidden = true;
      return;
    }
    toggleSpinner("settlement", true);
    try {
      const data = await fetchOeny(
        "/settlements/search?searchString=" + encodeURIComponent(term)
      );
      renderSettlementSuggestions(toList(data));
    } catch (err) {
      settlementList.hidden = true;
      showStatus(
        "Nem sikerült elérni az OENY település-keresőt (" + err.message + "). " +
          "A nyilvános proxyk épp nem elérhetők – állíts be saját Cloudflare Workert " +
          "(lásd cloudflare-worker.js).",
        true
      );
    } finally {
      toggleSpinner("settlement", false);
    }
  }, 300);

  // ---- Helyrajzi szám autocomplete ----
  function renderLotSuggestions(items) {
    lotList.innerHTML = "";
    if (!items.length) {
      lotList.innerHTML = '<li class="empty">Nincs találat</li>';
      lotList.hidden = false;
      return;
    }
    items.forEach((item) => {
      const hrsz = pick(item, ["lotNumber", "hrsz", "helyrajziSzam"], "");
      const address = pick(item, ["address", "cim", "fullAddress", "displayAddress"], "");
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.innerHTML = escapeHtml(hrsz) + (address ? "<small>" + escapeHtml(address) + "</small>" : "");
      li.addEventListener("click", () => selectLot(item, hrsz));
      lotList.appendChild(li);
    });
    lotList.hidden = false;
    lotInput.setAttribute("aria-expanded", "true");
  }

  async function selectLot(item, hrsz) {
    if (hrsz) lotInput.value = hrsz;
    lotList.hidden = true;
    lotInput.setAttribute("aria-expanded", "false");
    hideStatus();

    const id = pick(item, ["id", "parcelId"], "");
    if (!id) {
      renderParcelCard(null, item, hrsz);
      return;
    }

    results.hidden = true;
    showStatus("Cím betöltése…", false);
    try {
      const detail = await fetchOeny("/parcels/bounding-box?id=" + encodeURIComponent(id));
      hideStatus();
      renderParcelCard(detail, item, hrsz);
    } catch (err) {
      // Ha a részletek nem jönnek be, legalább az alap adatokat mutassuk.
      hideStatus();
      renderParcelCard(null, item, hrsz);
    }
  }

  const searchLots = debounce(async function () {
    const term = lotInput.value.trim();

    if (!selectedSettlement || !selectedSettlement.kshCode) {
      lotList.innerHTML = '<li class="empty">Először válassz egy települést.</li>';
      lotList.hidden = false;
      return;
    }
    if (term.length < 1) {
      lotList.hidden = true;
      return;
    }

    toggleSpinner("lotNumber", true);
    try {
      const data = await fetchOeny(
        "/parcels/search?kshCode=" +
          encodeURIComponent(selectedSettlement.kshCode) +
          "&lotNumber=" +
          encodeURIComponent(term)
      );
      renderLotSuggestions(toList(data));
    } catch (err) {
      lotList.hidden = true;
      showStatus("Nem sikerült elérni az OENY HRSZ-keresőt. " + err.message, true);
    } finally {
      toggleSpinner("lotNumber", false);
    }
  }, 300);

  // A térkép-réteghez később felhasználható geometria (EOV / EPSG:23700).
  let lastParcelGeometry = null;

  // Egy parcella találati kártyájának kirajzolása.
  // detail: a /parcels/bounding-box válasza (vagy null); item: a parcels/search elem.
  function renderParcelCard(detail, item, fallbackHrsz) {
    resultsList.innerHTML = "";

    const settlementName =
      (detail && detail.settlement && detail.settlement.name) ||
      pick(item, ["settlementName", "telepulesNev", "settlement"], selectedSettlement.name);

    const hrsz =
      (detail && detail.lotNumber) ||
      pick(item, ["lotNumber", "hrsz", "helyrajziSzam"], fallbackHrsz || "");

    const laymentRaw =
      (detail && detail.layment) || pick(item, ["layment", "fekves", "type"], "");
    const fekvesLabel = formatFekves(laymentRaw);

    // A bounding-box több címet is visszaadhat (pl. saroktelek).
    const addresses =
      detail && Array.isArray(detail.addresses)
        ? detail.addresses.map((a) => a && a.address && a.address.address).filter(Boolean)
        : [];
    const addressText = addresses.join(" · ");

    // Geometria eltárolása a későbbi térkép-megjelenítéshez.
    if (detail) {
      lastParcelGeometry = {
        boundingBox: detail.boundingBox || null,
        outline: detail.outline || null,
        point: detail.point || null,
      };
    }

    const titleLine = addressText ? settlementName + ", " + addressText : settlementName;

    // Térkép a találatra: pontos EOV-koordináta + telekhatár, tartalékként a cím.
    const latlng = parcelLatLng(detail);
    showMap(
      addresses[0] ? addresses[0] + ", " + settlementName : settlementName,
      latlng,
      detail
    );

    const card = document.createElement("article");
    card.className = "result-card";
    card.innerHTML =
      '<div class="result-card-head">' +
        '<span class="rc-place">' + escapeHtml(titleLine) + "</span>" +
        '<span class="rc-hrsz">HRSZ: ' + escapeHtml(hrsz) + "</span>" +
        (fekvesLabel ? '<span class="result-card-tag">' + escapeHtml(fekvesLabel) + "</span>" : "") +
      "</div>" +
      cadastralBlockHtml(settlementName, laymentRaw);
    resultsList.appendChild(card);

    resultsTitle.textContent = "Találatok (1 db)";
    results.hidden = false;
  }

  // Belterület / Külterület / Zártkert címke normalizálása.
  function formatFekves(value) {
    if (!value) return "";
    const v = String(value).toUpperCase();
    if (v.indexOf("BEL") === 0 || v.indexOf("BELTER") !== -1) return "Belterület";
    if (v.indexOf("KUL") === 0 || v.indexOf("KÜL") === 0 || v.indexOf("KULTER") !== -1) return "Külterület";
    if (v.indexOf("ZART") !== -1 || v.indexOf("ZÁRT") !== -1) return "Zártkert";
    return String(value);
  }

  // ---- Térképi alapadatok (saját földhivatali térkép-adathalmaz) ----
  // A terkep-adatok.json soronként egy település: tömb, fix oszlopindexekkel.
  // Illesztés a település NEVE szerint (ékezet-érzéketlen), mert a KSH-kódok
  // formátuma eltér az OENY-étől.
  const CADI = {
    nev: 0, ksh: 1,
    bVet: 2, bMer: 3, bFeld: 4, bFelm: 5, bHely: 6,
    kVet: 7, kMer: 8, kFeld: 9, kFelm: 10, kHely: 11,
    kkVet: 12, kkMer: 13, kkFeld: 14, kkFelm: 15, kkHely: 16,
    at2000: 17, at4000: 18, at5000: 19, at10000: 20,
    hiv: 23,
  };
  // Megengedett hibahatárok vetülettípus + méretarány szerint.
  const EOTR_V = new Set(["EOV", "DAT"]);
  const EOTR_T = {
    "1:1000": { hv: "± 0,35 m", fsz: "± 0,45 m" },
    "1:2000": { hv: "± 0,65 m", fsz: "± 0,90 m" },
    "1:4000": { hv: "± 1,30 m", fsz: "± 1,80 m" },
  };
  const REGI_T = {
    "1:1000": { hv: "± 0,45 m", fsz: "± 0,60 m" },
    "1:2000": { hv: "± 0,90 m", fsz: "± 1,20 m" },
    "1:2880": { hv: "± 1,30 m", fsz: "± 1,70 m" },
    "1:1440": { hv: "± 1,30 m", fsz: "± 1,70 m" },
    "1:4000": { hv: "± 1,75 m", fsz: "± 2,40 m" },
    "1:720": { hv: "—", fsz: "± 3,78 m" },
  };

  let cadByName = {};
  fetch("terkep-adatok.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((rows) => {
      if (Array.isArray(rows)) {
        rows.forEach((row) => {
          cadByName[normName(row[CADI.nev])] = row;
        });
      }
    })
    .catch(() => {});

  // Ékezet-érzéketlen név-normalizálás (illesztéshez).
  function normName(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/á/g, "a")
      .replace(/é/g, "e")
      .replace(/í/g, "i")
      .replace(/[óő]/g, "o")
      .replace(/[öő]/g, "o")
      .replace(/[úű]/g, "u")
      .replace(/[üű]/g, "u")
      .trim();
  }

  // Üres jelölők kezelése.
  function cadVal(x) {
    return !x || x === "-" || x === "None" ? "" : x;
  }

  function cadDeviation(vet, mer) {
    if (!vet || !mer || mer === "-") return null;
    return (EOTR_V.has(vet) ? EOTR_T : REGI_T)[mer] || null;
  }

  // OENY fekvés -> a megfelelő oszlopcsoport.
  function laymentCols(layment) {
    const u = String(layment || "").toUpperCase();
    if (u.indexOf("BEL") !== -1)
      return { label: "Belterület", vet: CADI.bVet, mer: CADI.bMer, feld: CADI.bFeld, felm: CADI.bFelm, hely: CADI.bHely };
    if (u.indexOf("ZART") !== -1 || u.indexOf("ZÁRT") !== -1)
      return { label: "Zártkert", vet: CADI.kkVet, mer: CADI.kkMer, feld: CADI.kkFeld, felm: CADI.kkFelm, hely: CADI.kkHely };
    if (u.indexOf("KUL") !== -1 || u.indexOf("KÜL") !== -1)
      return { label: "Külterület", vet: CADI.kVet, mer: CADI.kMer, feld: CADI.kFeld, felm: CADI.kFelm, hely: CADI.kHely };
    return { label: "Belterület", vet: CADI.bVet, mer: CADI.bMer, feld: CADI.bFeld, felm: CADI.bFelm, hely: CADI.bHely };
  }

  function cadRow(k, v) {
    const val = v != null && v !== "" ? String(v) : "—";
    const empty = val === "—" ? " empty" : "";
    return (
      '<div class="cad-row"><span class="cad-k">' +
      escapeHtml(k) +
      '</span><span class="cad-v' +
      empty +
      '">' +
      escapeHtml(val) +
      "</span></div>"
    );
  }

  // A talált településre + fekvésre vonatkozó térképi alapadatok HTML-je.
  function cadastralBlockHtml(settlementName, layment) {
    const row = cadByName[normName(settlementName)];
    if (!row) return "";

    const cat = laymentCols(layment);
    const vet = cadVal(row[cat.vet]);
    const mer = cadVal(row[cat.mer]);

    const office = cadVal(row[CADI.hiv]);

    let html = '<div class="cadastral">';
    if (office) {
      html +=
        '<div class="cad-office"><span class="cad-office-ic" aria-hidden="true">🏛</span>' +
        '<span>' + escapeHtml(office) + "</span></div>";
    }
    html +=
      '<p class="cadastral-title">Térképi alapadatok · ' +
      escapeHtml(cat.label) +
      "</p>" +
      '<div class="cadastral-grid">' +
      cadRow("Vetület", vet) +
      cadRow("Méretarány", mer) +
      cadRow("Feldolgozás", cadVal(row[cat.feld])) +
      cadRow("Felmérés éve", cadVal(row[cat.felm])) +
      cadRow("Helyesbítés", cadVal(row[cat.hely])) +
      "</div>";

    const dev = cadDeviation(vet, mer);
    if (dev) {
      const tipus = EOTR_V.has(vet) ? "EOTR" : "Régi";
      html +=
        '<div class="cad-sub-block"><p class="cad-sub">Megengedett eltérés (' +
        tipus +
        ")</p>" +
        cadRow("Határvonal", dev.hv) +
        cadRow("Szélességben", dev.fsz) +
        "</div>";
    }

    const at = [
      ["1:2000", row[CADI.at2000]],
      ["1:4000", row[CADI.at4000]],
      ["1:5000", row[CADI.at5000]],
      ["1:10000", row[CADI.at10000]],
    ];
    if (at.some((pair) => cadVal(pair[1]))) {
      html +=
        '<div class="cad-sub-block"><p class="cad-sub">Átnézeti</p><div class="cad-chips">' +
        at
          .map(
            (pair) =>
              '<span class="cad-chip' + (cadVal(pair[1]) ? " on" : "") + '">' + pair[0] + "</span>"
          )
          .join("") +
        "</div></div>";
    }

    html += "</div>";
    return html;
  }

  // ---- Térkép / Utcakép ----
  // EOV (HD72 / EPSG:23700) -> WGS84 átvetítés a pontos pozícióhoz.
  if (typeof proj4 !== "undefined") {
    proj4.defs(
      "EPSG:23700",
      "+proj=somerc +lat_0=47.14439372222222 +lon_0=19.04857177777778 " +
        "+k_0=0.99993 +x_0=650000 +y_0=200000 +ellps=GRS67 " +
        "+towgs84=52.17,-71.82,-14.9,0,0,0,0 +units=m +no_defs"
    );
  }

  let mapMode = "map"; // "map" vagy "sv" (utcakép)
  let mapLatLng = null; // "lat,lng" vagy null
  let mapQuery = null; // cím szöveg (tartalék, ha nincs koordináta)

  // EOV koordináta -> "lat,lng" sztring a bounding-box válaszból.
  function parcelLatLng(detail) {
    if (!detail || typeof proj4 === "undefined") return null;
    let x, y;
    if (detail.point && detail.point.x != null) {
      x = detail.point.x;
      y = detail.point.y;
    } else if (detail.boundingBox && detail.boundingBox.min && detail.boundingBox.max) {
      x = (detail.boundingBox.min.x + detail.boundingBox.max.x) / 2;
      y = (detail.boundingBox.min.y + detail.boundingBox.max.y) / 2;
    } else {
      return null;
    }
    try {
      const wgs = proj4("EPSG:23700", "WGS84", [x, y]);
      return wgs[1].toFixed(7) + "," + wgs[0].toFixed(7);
    } catch (e) {
      return null;
    }
  }

  function renderMapFrame() {
    if (!mapFrame) return;
    let src = null;
    if (mapMode === "sv" && mapLatLng) {
      src =
        "https://maps.google.com/maps?q=&layer=c&cbll=" +
        mapLatLng +
        "&cbp=12,0,0,0,0&output=svembed";
    } else if (mapLatLng) {
      src = "https://maps.google.com/maps?q=" + mapLatLng + "&z=18&output=embed";
    } else if (mapQuery) {
      src =
        "https://maps.google.com/maps?q=" +
        encodeURIComponent(mapQuery + ", Magyarország") +
        "&z=18&output=embed";
    }
    if (!src) return;

    mapFrame.src = src;
    mapFrame.hidden = false;
    if (mapPlaceholder) mapPlaceholder.hidden = true;
    if (mapToggle) mapToggle.hidden = false;
    // Utcakép csak pontos koordinátával érhető el.
    if (svButton) svButton.disabled = !mapLatLng;
    document.querySelectorAll(".map-toggle-btn").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.mode === mapMode)
    );
  }

  // A találathoz beállítja a térkép adatait és kirajzolja.
  function showMap(query, latlng, detail) {
    mapQuery = query || null;
    mapLatLng = latlng || null;

    // Ha van API-kulcs és pontos koordináta: interaktív térkép húzható
    // Pegmannel és a telekhatár poligonjával.
    if (MAPS_API_KEY && mapLatLng) {
      showInteractiveMap(mapLatLng, detail);
      return;
    }

    if (!mapLatLng) mapMode = "map"; // utcakép koordináta nélkül nem megy
    renderMapFrame();
  }

  // ---- Interaktív Google térkép (API-kulccsal, húzható Pegman) ----
  let gmap = null;
  let gmarker = null;
  let gmapsLoading = null;
  let parcelPolygons = [];
  let parcelBoundaryMarkers = [];

  function ensureGoogleMaps() {
    if (window.google && window.google.maps) return Promise.resolve();
    if (gmapsLoading) return gmapsLoading;
    gmapsLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src =
        "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(MAPS_API_KEY);
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("A Google Maps API nem töltődött be."));
      document.head.appendChild(s);
    });
    return gmapsLoading;
  }

  async function showInteractiveMap(latlngStr, detail) {
    const parts = latlngStr.split(",");
    const pos = { lat: parseFloat(parts[0]), lng: parseFloat(parts[1]) };

    try {
      await ensureGoogleMaps();
    } catch (e) {
      // Ha az API nem tölt be (pl. hibás kulcs), essünk vissza a beágyazott térképre.
      renderMapFrame();
      return;
    }

    if (mapFrame) mapFrame.hidden = true;
    if (mapPlaceholder) mapPlaceholder.hidden = true;
    if (mapCanvas) mapCanvas.hidden = false;

    if (!gmap) {
      gmap = new google.maps.Map(mapCanvas, {
        center: pos,
        zoom: 19,
        mapTypeId: google.maps.MapTypeId.HYBRID, // műholdkép alapértelmezetten
        streetViewControl: true, // a húzható sárga emberke (Pegman)
        mapTypeControl: true,
        fullscreenControl: true,
      });
      gmarker = new google.maps.Marker({ map: gmap, position: pos });
    } else {
      gmap.setCenter(pos);
      gmarker.setPosition(pos);
    }

    drawParcelOutline(detail);
  }

  // A telekhatárt rajzolja ki a bounding-box outline poligonjából (EOV -> WGS84).
  function drawParcelOutline(detail) {
    // Korábbi határvonal + pontok törlése.
    parcelPolygons.forEach((p) => p.setMap(null));
    parcelPolygons = [];
    parcelBoundaryMarkers.forEach((m) => m.setMap(null));
    parcelBoundaryMarkers = [];

    const outline = detail && detail.outline;
    if (!outline || typeof proj4 === "undefined") return;
    if (outline.type !== "MultiPolygon" && outline.type !== "Polygon") return;

    // Egységesítés: poligonok tömbje, mindegyik gyűrűk (rings) tömbje.
    const polygons =
      outline.type === "MultiPolygon" ? outline.coordinates : [outline.coordinates];

    const bounds = new google.maps.LatLngBounds();
    const boundaryRings = [];

    polygons.forEach((rings) => {
      const paths = rings.map((ring) =>
        ring.map((pt) => {
          const wgs = proj4("EPSG:23700", "WGS84", [pt[0], pt[1]]);
          const latlng = { lat: wgs[1], lng: wgs[0] };
          bounds.extend(latlng);
          return latlng;
        })
      );
      const poly = new google.maps.Polygon({
        paths: paths,
        strokeColor: "#FF3B30",
        strokeOpacity: 1,
        strokeWeight: 2,
        fillColor: "#FF3B30",
        fillOpacity: 0.12,
        map: gmap,
      });
      parcelPolygons.push(poly);
      paths.forEach((ring) => boundaryRings.push(ring));
    });

    // A telekhatárt apró pontokkal is kirakjuk, de ezeket a Street View
    // PANORÁMÁHOZ kötjük – így CSAK utcaképen látszanak, a felülnézeti
    // térképen nem (ott a Polygon mutatja a határt).
    const panorama = gmap.getStreetView();
    const dots = boundaryDots(boundaryRings, 3, 220);
    const dotIcon = {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 3.2,
      fillColor: "#FF3B30",
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 0.8,
    };
    dots.forEach((d) => {
      parcelBoundaryMarkers.push(
        new google.maps.Marker({ position: d, map: panorama, icon: dotIcon, clickable: false, zIndex: 5 })
      );
    });

    // A térképet a telekhatárhoz igazítjuk.
    if (!bounds.isEmpty()) gmap.fitBounds(bounds);
  }

  // Méteres távolság két WGS84 pont között (haversine).
  function metersBetween(a, b) {
    const R = 6371000;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const la1 = (a.lat * Math.PI) / 180;
    const la2 = (b.lat * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // A határvonal mentén ~spacing méterenként pontokat generál (max maxDots db).
  function boundaryDots(rings, spacing, maxDots) {
    const pts = [];
    rings.forEach((ring) => {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i];
        const b = ring[i + 1];
        const n = Math.max(1, Math.round(metersBetween(a, b) / spacing));
        for (let j = 0; j < n; j++) {
          const t = j / n;
          pts.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
        }
      }
    });
    // Ha túl sok pont lenne, egyenletesen ritkítunk.
    if (pts.length > maxDots) {
      const step = Math.ceil(pts.length / maxDots);
      return pts.filter((_, i) => i % step === 0);
    }
    return pts;
  }

  // ---- Töltésjelző ----
  function toggleSpinner(name, on) {
    const spinner = document.querySelector('[data-spinner="' + name + '"]');
    if (spinner) spinner.hidden = !on;
  }

  // ---- Törlés (×) gombok ----
  document.querySelectorAll(".clear-btn").forEach((btn) => {
    const input = document.getElementById(btn.dataset.clear);
    if (!input) return;
    const sync = () => { btn.hidden = input.value.length === 0; };
    input.addEventListener("input", sync);
    btn.addEventListener("click", () => {
      input.value = "";
      input.focus();
      sync();
      if (input === settlementInput) {
        selectedSettlement = null;
        settlementList.hidden = true;
      }
      if (input === lotInput) {
        lotList.hidden = true;
      }
    });
    sync();
  });

  // ---- Eseménykötések ----
  settlementInput.addEventListener("input", searchSettlements);
  settlementInput.addEventListener("focus", () => {
    if (settlementList.children.length && !selectedSettlement) settlementList.hidden = false;
  });

  lotInput.addEventListener("input", searchLots);
  lotInput.addEventListener("focus", () => {
    if (lotList.children.length) lotList.hidden = false;
  });

  // Kattintás a listákon kívülre -> bezárás.
  document.addEventListener("click", (e) => {
    if (!settlementInput.parentElement.contains(e.target)) {
      settlementList.hidden = true;
      settlementInput.setAttribute("aria-expanded", "false");
    }
    if (!lotInput.parentElement.contains(e.target)) {
      lotList.hidden = true;
      lotInput.setAttribute("aria-expanded", "false");
    }
  });
})();
