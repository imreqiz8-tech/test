(() => {
  const BUMP_SELECTORS = [
    'button[data-qa="resume-update-button_actions"]',
    'button[data-qa="resume-update-button"]',
    'a[data-qa="resume-update-button"]',
    'button[data-qa*="resume-update"]',
    'a[data-qa*="resume-update"]'
  ];

  const COOLDOWN_SELECTORS = [
    '[data-qa="resume-update-availability"]',
    '[data-qa="resume-update-button_disabled"]'
  ];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function findButton() {
    for (const sel of BUMP_SELECTORS) {
      const el = document.querySelector(sel);
      if (el && !el.disabled && el.getAttribute("aria-disabled") !== "true") return el;
    }
    const candidates = Array.from(document.querySelectorAll("button, a"));
    return (
      candidates.find((el) => /поднять\s+в\s+поиске|поднять\s+резюме/i.test(el.textContent || "")) ||
      null
    );
  }

  function findCooldown() {
    for (const sel of COOLDOWN_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el.textContent?.trim() || "Резюме недавно поднималось";
    }
    return null;
  }

  function pageTitle() {
    const t = document.querySelector('[data-qa="resume-title"], h1');
    return t?.textContent?.trim() || document.title;
  }

  async function waitForUI(maxMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      if (findButton() || findCooldown()) return;
      await sleep(250);
    }
  }

  function report(result) {
    chrome.runtime.sendMessage({ type: "BUMP_RESULT", result }).catch(() => {});
  }

  async function tryBump() {
    await waitForUI();
    const btn = findButton();
    if (btn) {
      btn.click();
      await sleep(1500);
      report({ status: "success", title: pageTitle() });
      return;
    }
    const cooldown = findCooldown();
    if (cooldown) {
      report({ status: "cooldown", message: cooldown, title: pageTitle() });
      return;
    }
    report({ status: "error", message: "Кнопка поднятия не найдена", title: pageTitle() });
  }

  tryBump();
})();
