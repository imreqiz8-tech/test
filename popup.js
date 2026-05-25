const toggle = document.getElementById("toggle");
const statusEl = document.getElementById("status");
const nextEl = document.getElementById("next");
const lastEl = document.getElementById("last");
const bumpBtn = document.getElementById("bumpNow");
const openBtn = document.getElementById("openResumes");

function fmt(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

function describeResult(r) {
  if (!r) return "пока не запускалось";
  if (r.status === "success") return "успешно поднято";
  if (r.status === "cooldown") return "кулдаун: " + (r.message || "");
  if (r.status === "triggered") return "запущено, ждём результат…";
  if (r.status === "error") return "ошибка: " + (r.message || r.error || "");
  return r.status;
}

async function refresh() {
  const state = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  toggle.checked = !!state.enabled;
  statusEl.textContent = state.enabled ? "Включено" : "Выключено";
  nextEl.textContent = "Следующий запуск: " + fmt(state.nextBumpAt);
  lastEl.textContent = "Последний: " + fmt(state.lastBumpAt) + " — " + describeResult(state.lastResult);
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

refresh();
setInterval(refresh, 5000);
