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
    const link = buildPropertySheetLink(settlementName, laymentRaw, hrsz, addresses[0] || "");

    const card = document.createElement("article");
    card.className = "result-card";
    card.innerHTML =
      '<p class="result-card-address">' + escapeHtml(titleLine) + "</p>" +
      '<p class="result-card-hrsz">HRSZ: ' + escapeHtml(hrsz) + "</p>" +
      '<div class="result-card-footer-items">' +
        (fekvesLabel ? '<span class="result-card-tag">' + escapeHtml(fekvesLabel) + "</span>" : "<span></span>") +
        '<a class="property-sheet-navigation-link" href="' + link + '" target="_blank" rel="noopener">' +
          'Tulajdoni lap <span class="chevron" aria-hidden="true">›</span>' +
        "</a>" +
      "</div>";
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

  // Hivatalos tulajdoni lap deep-link (magyarorszag.hu E-ingatlan).
  function buildPropertySheetLink(settlementName, fekvesRaw, hrsz, address) {
    const fekvesCode = (function () {
      const v = String(fekvesRaw || "").toUpperCase();
      if (v.indexOf("BEL") !== -1) return "BELTERULET";
      if (v.indexOf("KUL") !== -1 || v.indexOf("KÜL") !== -1) return "KULTERULET";
      if (v.indexOf("ZART") !== -1 || v.indexOf("ZÁRT") !== -1) return "ZARTKERT";
      return "";
    })();

    const params = new URLSearchParams();
    params.set("hrsz.telepules", settlementName);
    if (fekvesCode) params.set("hrsz.fekves", fekvesCode);
    params.set("hrsz.hrszFold", hrsz);
    if (address) params.set("cim", address);
    return "https://magyarorszag.hu/eing_new?" + params.toString();
  }

  // ---- Töltésjelző ----
  function toggleSpinner(name, on) {
    const spinner = document.querySelector('[data-spinner="' + name + '"]');
    if (spinner) spinner.hidden = !on;
  }

  // ---- Fülváltás ----
  const tabs = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".tab-panel");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      tabs.forEach((t) => {
        const active = t === tab;
        t.classList.toggle("is-active", active);
        t.setAttribute("aria-selected", active ? "true" : "false");
      });
      panels.forEach((panel) => {
        panel.hidden = panel.dataset.panel !== target;
      });
    });
  });

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
