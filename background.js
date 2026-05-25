const ALARM_NAME = "bump-resume";
const INTERVAL_MINUTES = 4 * 60;
const RESUMES_URL = "https://hh.ru/applicant/resumes";

async function setEnabled(enabled) {
  await chrome.storage.local.set({ enabled });
  if (enabled) {
    await chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: 0.1,
      periodInMinutes: INTERVAL_MINUTES
    });
  } else {
    await chrome.alarms.clear(ALARM_NAME);
  }
}

async function getState() {
  const { enabled = true, lastBumpAt = null, lastResult = null } =
    await chrome.storage.local.get(["enabled", "lastBumpAt", "lastResult"]);
  const alarm = await chrome.alarms.get(ALARM_NAME);
  return {
    enabled,
    lastBumpAt,
    lastResult,
    nextBumpAt: alarm ? alarm.scheduledTime : null
  };
}

async function notify(title, message) {
  try {
    await chrome.notifications.create({
      type: "basic",
      iconUrl: "icon128.png",
      title,
      message
    });
  } catch (_) {
    // notifications icon may be missing — ignore
  }
}

async function findResumeTab() {
  const tabs = await chrome.tabs.query({ url: ["https://hh.ru/*", "https://*.hh.ru/*"] });
  return tabs.find((t) => /\/applicant\/resumes|\/resume\//.test(t.url || "")) || null;
}

async function ensureResumeTab() {
  let tab = await findResumeTab();
  if (tab) {
    await chrome.tabs.reload(tab.id);
    return tab;
  }
  return chrome.tabs.create({ url: RESUMES_URL, active: false });
}

async function bumpNow(reason = "scheduled") {
  try {
    const tab = await ensureResumeTab();
    await chrome.storage.local.set({
      lastResult: { status: "triggered", reason, at: Date.now(), tabId: tab.id }
    });
  } catch (err) {
    await chrome.storage.local.set({
      lastResult: { status: "error", reason, at: Date.now(), error: String(err) }
    });
    notify("Авто-поднятие резюме", "Не удалось открыть страницу резюме: " + err);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const { enabled } = await chrome.storage.local.get("enabled");
  if (enabled === undefined) await setEnabled(true);
  else await setEnabled(enabled);
});

chrome.runtime.onStartup.addListener(async () => {
  const { enabled = true } = await chrome.storage.local.get("enabled");
  if (enabled) await setEnabled(true);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) bumpNow("alarm");
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === "GET_STATE") sendResponse(await getState());
    else if (msg?.type === "SET_ENABLED") {
      await setEnabled(!!msg.enabled);
      sendResponse(await getState());
    } else if (msg?.type === "BUMP_NOW") {
      await bumpNow("manual");
      sendResponse(await getState());
    } else if (msg?.type === "BUMP_RESULT") {
      await chrome.storage.local.set({
        lastBumpAt: Date.now(),
        lastResult: { ...msg.result, at: Date.now() }
      });
      if (msg.result?.status === "success") {
        notify("Резюме поднято", msg.result.title || "Успешно");
      } else if (msg.result?.status === "cooldown") {
        notify("Резюме ещё в кулдауне", msg.result.message || "Повторим позже");
      } else if (msg.result?.status === "error") {
        notify("Не удалось поднять резюме", msg.result.message || "Ошибка");
      }
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false, error: "unknown message" });
    }
  })();
  return true;
});
