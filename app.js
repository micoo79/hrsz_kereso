// Helyrajziszám-kereső – bal oldali kereső panel interakciói.
// Megjegyzés: a kereső jelenleg az űrlap felületét valósítja meg; az élő
// adatlekérdezés (település- és HRSZ-keresés) a következő fejlesztési lépés.

(function () {
  "use strict";

  // --- Fülváltás (Cím / Helyrajzi szám) ---
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

  // --- Törlés (×) gombok megjelenítése és kezelése ---
  const clearButtons = document.querySelectorAll(".clear-btn");

  clearButtons.forEach((btn) => {
    const input = document.getElementById(btn.dataset.clear);
    if (!input) return;

    const sync = () => {
      btn.hidden = input.value.length === 0;
    };

    input.addEventListener("input", sync);

    btn.addEventListener("click", () => {
      input.value = "";
      input.focus();
      sync();
    });

    sync();
  });
})();
