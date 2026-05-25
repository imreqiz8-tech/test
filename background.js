const ALARM_NAME = "bump-resume";
const DEFAULT_SETTINGS = {
  enabled: true,
  intervalMinutes: 245,
  jitterMinutes: 5,
  notificationsEnabled: true,
  closeTabAfter: true,
  quietHoursEnabled: false,
  quietHoursStart: 23,
  quietHoursEnd: 7,
  resumeUrl: ""
};
const RESUMES_URL = "https://hh.ru/applicant/resumes";

async function getSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  return { ...DEFAULT_SETTINGS, ...stored };
}

async function getState() {
  const settings = await getSettings();
  const { lastBumpAt = null, lastResult = null, nextBumpAt = null } =
    await chrome.storage.local.get(["lastBumpAt", "lastResult", "nextBumpAt"]);
  const alarm = await chrome.alarms.get(ALARM_NAME);
  return {
    settings,
    lastBumpAt,
    lastResult,
    nextBumpAt: alarm ? alarm.scheduledTime : nextBumpAt
  };
}

function withJitter(ms, jitterMin) {
  if (!jitterMin || jitterMin <= 0) return ms;
  const jitterMs = jitterMin * 60_000;
  return ms + Math.floor(Math.random() * jitterMs);
}

function inQuietHours(date, start, end) {
  const h = date.getHours();
  if (start === end) return false;
  return start < end ? h >= start && h < end : h >= start || h < end;
}

function nextOutOfQuietHours(from, start, end) {
  const d = new Date(from);
  while (inQuietHours(d, start, end)) {
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
  }
  return d.getTime();
}

async function scheduleNext(delayMs, reason) {
  const settings = await getSettings();
  if (!settings.enabled) {
    await chrome.alarms.clear(ALARM_NAME);
    await chrome.storage.local.set({ nextBumpAt: null });
    return;
  }

  let fireAt = Date.now() + Math.max(delayMs, 30_000);

  if (settings.quietHoursEnabled) {
    fireAt = nextOutOfQuietHours(fireAt, settings.quietHoursStart, settings.quietHoursEnd);
  }

  fireAt = withJitter(fireAt, settings.jitterMinutes);

  await chrome.alarms.create(ALARM_NAME, { when: fireAt });
  await chrome.storage.local.set({ nextBumpAt: fireAt, lastScheduleReason: reason });
}

async function scheduleDefault(reason) {
  const { intervalMinutes } = await getSettings();
  await scheduleNext(intervalMinutes * 60_000, reason);
}

async function notify(title, message) {
  const { notificationsEnabled } = await getSettings();
  if (!notificationsEnabled) return;
  try {
    await chrome.notifications.create({
      type: "basic",
      iconUrl: "icon128.png",
      title,
      message
    });
  } catch (_) {
    // icon may be missing — ignore
  }
}

async function findResumeTab() {
  const tabs = await chrome.tabs.query({ url: ["https://hh.ru/*", "https://*.hh.ru/*"] });
  return tabs.find((t) => /\/applicant\/resumes|\/resume\//.test(t.url || "")) || null;
}

async function openResumePage(active = false) {
  const { resumeUrl } = await getSettings();
  const target = resumeUrl?.trim() || RESUMES_URL;

  let tab = await findResumeTab();
  if (tab) {
    await chrome.tabs.reload(tab.id);
    return { tab, opened: false };
  }
  tab = await chrome.tabs.create({ url: target, active });
  return { tab, opened: true };
}

async function bumpNow(reason = "scheduled") {
  try {
    const { tab, opened } = await openResumePage(false);
    await chrome.storage.local.set({
      lastResult: { status: "triggered", reason, at: Date.now(), tabId: tab.id, openedNew: opened }
    });
  } catch (err) {
    await chrome.storage.local.set({
      lastResult: { status: "error", reason, at: Date.now(), error: String(err) }
    });
    await notify("Авто-поднятие резюме", "Не удалось открыть страницу резюме: " + err);
    await scheduleDefault("error-fallback");
  }
}

async function closeTabSoon(tabId) {
  const { closeTabAfter } = await getSettings();
  if (!closeTabAfter || !tabId) return;
  setTimeout(() => {
    chrome.tabs.remove(tabId).catch(() => {});
  }, 3000);
}

async function handleBumpResult(result, senderTabId) {
  const settings = await getSettings();
  const at = Date.now();

  if (result.status === "success") {
    await chrome.storage.local.set({
      lastBumpAt: at,
      lastResult: { ...result, at }
    });
    await scheduleNext(settings.intervalMinutes * 60_000, "after-success");
    await notify("Резюме поднято", result.title || "Успешно");
    await closeTabSoon(senderTabId);
    return;
  }

  if (result.status === "cooldown") {
    let waitMs = Number.isFinite(result.remainingMs) && result.remainingMs > 0
      ? result.remainingMs + 30_000
      : settings.intervalMinutes * 60_000;

    await chrome.storage.local.set({
      lastResult: { ...result, at }
    });
    await scheduleNext(waitMs, result.remainingMs ? "cooldown-detected" : "cooldown-fallback");

    const human = result.remainingMs
      ? formatDuration(result.remainingMs)
      : "интервал по умолчанию";
    await notify(
      "Резюме уже поднято",
      `Подождём ${human}` + (result.likelyManual ? " (похоже, поднимали вручную)" : "")
    );
    await closeTabSoon(senderTabId);
    return;
  }

  // error or unknown
  await chrome.storage.local.set({
    lastResult: { ...result, at }
  });
  await scheduleDefault("error-fallback");
  await notify("Не удалось поднять резюме", result.message || "Ошибка");
  await closeTabSoon(senderTabId);
}

function formatDuration(ms) {
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0 && m > 0) return `${h} ч ${m} мин`;
  if (h > 0) return `${h} ч`;
  return `${m} мин`;
}

async function applyEnabled(enabled) {
  await chrome.storage.local.set({ enabled });
  if (enabled) await scheduleNext(60_000, "enabled");
  else {
    await chrome.alarms.clear(ALARM_NAME);
    await chrome.storage.local.set({ nextBumpAt: null });
  }
}

async function saveSettings(patch) {
  const allowed = Object.keys(DEFAULT_SETTINGS);
  const clean = {};
  for (const k of allowed) if (k in patch) clean[k] = patch[k];
  await chrome.storage.local.set(clean);
  const settings = await getSettings();
  if (settings.enabled) await scheduleNext(settings.intervalMinutes * 60_000, "settings-updated");
  else await chrome.alarms.clear(ALARM_NAME);
}

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  if (settings.enabled) await scheduleNext(60_000, "installed");
});

chrome.runtime.onStartup.addListener(async () => {
  const settings = await getSettings();
  if (settings.enabled) {
    const alarm = await chrome.alarms.get(ALARM_NAME);
    if (!alarm) await scheduleNext(60_000, "startup");
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) bumpNow("alarm");
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "GET_STATE") sendResponse(await getState());
      else if (msg?.type === "SET_ENABLED") {
        await applyEnabled(!!msg.enabled);
        sendResponse(await getState());
      } else if (msg?.type === "BUMP_NOW") {
        await bumpNow("manual");
        sendResponse(await getState());
      } else if (msg?.type === "SAVE_SETTINGS") {
        await saveSettings(msg.settings || {});
        sendResponse(await getState());
      } else if (msg?.type === "BUMP_RESULT") {
        await handleBumpResult(msg.result || {}, sender?.tab?.id);
        sendResponse({ ok: true });
      } else if (msg?.type === "OPEN_OPTIONS") {
        chrome.runtime.openOptionsPage();
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: "unknown message" });
      }
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
  })();
  return true;
});
