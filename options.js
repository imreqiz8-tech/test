const DEFAULTS = {
  intervalMinutes: 245,
  jitterMinutes: 5,
  notificationsEnabled: true,
  closeTabAfter: true,
  quietHoursEnabled: false,
  quietHoursStart: 23,
  quietHoursEnd: 7,
  resumeUrl: ""
};

const FIELDS = {
  intervalMinutes: "number",
  jitterMinutes: "number",
  quietHoursEnabled: "bool",
  quietHoursStart: "number",
  quietHoursEnd: "number",
  closeTabAfter: "bool",
  notificationsEnabled: "bool",
  resumeUrl: "string"
};

function readFields() {
  const out = {};
  for (const [name, type] of Object.entries(FIELDS)) {
    const el = document.getElementById(name);
    if (!el) continue;
    if (type === "bool") out[name] = el.checked;
    else if (type === "number") {
      const v = parseInt(el.value, 10);
      out[name] = Number.isFinite(v) ? v : DEFAULTS[name];
    } else out[name] = el.value.trim();
  }
  out.intervalMinutes = Math.max(60, Math.min(1440, out.intervalMinutes));
  out.jitterMinutes = Math.max(0, Math.min(60, out.jitterMinutes));
  out.quietHoursStart = Math.max(0, Math.min(23, out.quietHoursStart));
  out.quietHoursEnd = Math.max(0, Math.min(23, out.quietHoursEnd));
  return out;
}

function applyToForm(settings) {
  for (const [name, type] of Object.entries(FIELDS)) {
    const el = document.getElementById(name);
    if (!el) continue;
    const value = settings[name] ?? DEFAULTS[name];
    if (type === "bool") el.checked = !!value;
    else el.value = value;
  }
}

async function load() {
  const state = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  applyToForm(state.settings || DEFAULTS);
}

function flashSaved() {
  const el = document.getElementById("saved");
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 1500);
}

document.getElementById("save").addEventListener("click", async () => {
  const settings = readFields();
  await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings });
  flashSaved();
});

document.getElementById("reset").addEventListener("click", async () => {
  applyToForm(DEFAULTS);
  await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings: DEFAULTS });
  flashSaved();
});

load();
