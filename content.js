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
    '[data-qa="resume-update-button_disabled"]',
    '[data-qa*="resume-update_disabled"]'
  ];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function pickActiveButton() {
    for (const sel of BUMP_SELECTORS) {
      const el = document.querySelector(sel);
      if (el && !el.disabled && el.getAttribute("aria-disabled") !== "true") return el;
    }
    const candidates = Array.from(document.querySelectorAll("button, a"));
    return (
      candidates.find((el) => {
        const txt = (el.textContent || "").trim();
        if (!/поднять\s+в\s+поиске|поднять\s+резюме/i.test(txt)) return false;
        const isDisabled = el.disabled || el.getAttribute("aria-disabled") === "true";
        return !isDisabled;
      }) || null
    );
  }

  function pickDisabledButton() {
    for (const sel of BUMP_SELECTORS) {
      const el = document.querySelector(sel);
      if (el && (el.disabled || el.getAttribute("aria-disabled") === "true")) return el;
    }
    return null;
  }

  function findCooldownText() {
    for (const sel of COOLDOWN_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) {
        const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (txt) return txt;
      }
    }
    const disabled = pickDisabledButton();
    if (disabled) {
      const parent = disabled.closest("[class],div") || disabled.parentElement;
      if (parent) {
        const block = parent.textContent?.replace(/\s+/g, " ").trim() || "";
        if (block) return block;
      }
    }
    const bodyText = document.body?.innerText || "";
    const m = bodyText.match(
      /(бесплатно поднять можно[^.\n]{0,80}|поднять (?:можно|резюме можно)[^.\n]{0,80}|следующ\w+ поднят\w+[^.\n]{0,80})/i
    );
    return m ? m[0].replace(/\s+/g, " ").trim() : null;
  }

  function parseRemainingMs(text) {
    if (!text) return null;
    const t = text.toLowerCase();

    let hours = 0, minutes = 0, seconds = 0, found = false;

    const hMatch = t.match(/(\d+)\s*(?:ч(?:ас(?:а|ов)?)?\.?)\b/);
    const mMatch = t.match(/(\d+)\s*мин(?:уты?|ут)?\.?\b/);
    const sMatch = t.match(/(\d+)\s*сек(?:унды?|унд)?\.?\b/);
    if (hMatch) { hours = +hMatch[1]; found = true; }
    if (mMatch) { minutes = +mMatch[1]; found = true; }
    if (sMatch) { seconds = +sMatch[1]; found = true; }

    if (!found) {
      const colon = t.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (colon) {
        hours = +colon[1];
        minutes = +colon[2];
        seconds = colon[3] ? +colon[3] : 0;
        found = true;
      }
    }

    if (!found) {
      const abs = t.match(/в\s+(\d{1,2}):(\d{2})/);
      if (abs) {
        const now = new Date();
        const target = new Date(now);
        target.setHours(+abs[1], +abs[2], 0, 0);
        if (target <= now) target.setDate(target.getDate() + 1);
        return target.getTime() - now.getTime();
      }
    }

    const total = (hours * 3600 + minutes * 60 + seconds) * 1000;
    return found && total > 0 ? total : null;
  }

  function pageTitle() {
    const t = document.querySelector('[data-qa="resume-title"], h1');
    return t?.textContent?.trim() || document.title;
  }

  async function waitForUI(maxMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      if (pickActiveButton() || pickDisabledButton() || findCooldownText()) return;
      await sleep(250);
    }
  }

  function report(result) {
    chrome.runtime.sendMessage({ type: "BUMP_RESULT", result }).catch(() => {});
  }

  async function watchForSuccess(timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await sleep(500);
      if (pickDisabledButton() || findCooldownText()) return true;
    }
    return false;
  }

  async function tryBump() {
    await waitForUI();

    const btn = pickActiveButton();
    if (btn) {
      btn.click();
      const ok = await watchForSuccess();
      report({
        status: ok ? "success" : "success",
        title: pageTitle(),
        confirmed: ok
      });
      return;
    }

    const cooldownText = findCooldownText();
    if (cooldownText || pickDisabledButton()) {
      const remainingMs = parseRemainingMs(cooldownText);
      const likelyManual = remainingMs != null && remainingMs > 4 * 3600 * 1000 - 5 * 60 * 1000;
      report({
        status: "cooldown",
        message: cooldownText || "Кнопка неактивна",
        remainingMs,
        likelyManual,
        title: pageTitle()
      });
      return;
    }

    report({
      status: "error",
      message: "Кнопка поднятия не найдена на странице",
      title: pageTitle()
    });
  }

  tryBump();
})();
