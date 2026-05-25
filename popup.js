const toggle = document.getElementById("toggle");
const statusEl = document.getElementById("status");
const nextEl = document.getElementById("next");
const lastEl = document.getElementById("last");
const bumpBtn = document.getElementById("bumpNow");
const openBtn = document.getElementById("openResumes");
const optionsBtn = document.getElementById("openOptions");

function fmtDateTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit"
  });
}

function fmtRelative(ts) {
  if (!ts) return "";
  const diff = ts - Date.now();
  if (diff <= 0) return "сейчас";
  const totalMin = Math.round(diff / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `через ${h} ч ${m} мин`;
  if (h > 0) return `через ${h} ч`;
  return `через ${m} мин`;
}

function describeResult(r) {
  if (!r) return { text: "пока не запускалось", cls: "muted" };
  if (r.status === "success") return { text: "успешно поднято", cls: "ok" };
  if (r.status === "cooldown") {
    const extra = r.likelyManual ? " (поднималось вручную)" : "";
    return { text: "в кулдауне" + extra, cls: "warn" };
  }
  if (r.status === "triggered") return { text: "запущено, ждём результат…", cls: "muted" };
  if (r.status === "error") return { text: "ошибка: " + (r.message || r.error || ""), cls: "err" };
  return { text: r.status, cls: "muted" };
}

async function refresh() {
  const state = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  toggle.checked = !!state.settings.enabled;
  statusEl.textContent = state.settings.enabled ? "Включено" : "Выключено";
  statusEl.className = "row " + (state.settings.enabled ? "ok" : "muted");

  const next = state.nextBumpAt;
  nextEl.textContent = state.settings.enabled
    ? `Следующее: ${fmtDateTime(next)} (${fmtRelative(next)})`
    : "Расписание остановлено";

  const r = describeResult(state.lastResult);
  lastEl.textContent = `Последнее: ${fmtDateTime(state.lastBumpAt || state.lastResult?.at)} — ${r.text}`;
  lastEl.className = "row " + r.cls;
}

toggle.addEventListener("change", async () => {
  await chrome.runtime.sendMessage({ type: "SET_ENABLED", enabled: toggle.checked });
  refresh();
});

bumpBtn.addEventListener("click", async () => {
  bumpBtn.disabled = true;
  await chrome.runtime.sendMessage({ type: "BUMP_NOW" });
  setTimeout(() => {
    bumpBtn.disabled = false;
    refresh();
  }, 1500);
});

openBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: "https://hh.ru/applicant/resumes" });
});

optionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

refresh();
setInterval(refresh, 3000);
