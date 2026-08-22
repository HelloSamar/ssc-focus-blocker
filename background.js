const DASHBOARD_URL = chrome.runtime.getURL("dashboard.html");

function normalizeDomain(input) {
  const value = String(input || "").trim().toLowerCase();
  if (!value) return null;

  try {
    const url = value.includes("://") ? new URL(value) : new URL(`https://${value}`);
    const domain = url.hostname.replace(/^www\./, "");
    return isValidDomain(domain) ? domain : null;
  } catch {
    const domain = value
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split(/[/?#]/)[0]
      .trim();
    return isValidDomain(domain) ? domain : null;
  }
}

function normalizeKeyword(input) {
  const keyword = String(input || "").trim().toLowerCase();
  return /^[a-z0-9._-]+$/.test(keyword) ? keyword : null;
}

function isValidDomain(domain) {
  return /^[a-z0-9.-]+$/.test(domain) &&
    domain.includes(".") &&
    !domain.startsWith(".") &&
    !domain.endsWith(".") &&
    !domain.includes("..");
}

function uniqueClean(items, normalizer) {
  return [...new Set(items.map(normalizer).filter(Boolean))];
}

function buildRules(blocklist, keywords) {
  const domains = uniqueClean(blocklist, normalizeDomain);
  const words = uniqueClean(keywords, normalizeKeyword);

  const domainRules = domains.map((domain, i) => ({
    id: i + 1,
    priority: 1,
    action: {
      type: "redirect",
      redirect: { url: `${DASHBOARD_URL}?blocked=${encodeURIComponent(domain)}&kind=domain` }
    },
    condition: { urlFilter: `||${domain}^`, resourceTypes: ["main_frame"] }
  }));

  const keywordRules = words.map((word, i) => ({
    id: 1000 + i + 1,
    priority: 1,
    action: {
      type: "redirect",
      redirect: { url: `${DASHBOARD_URL}?blocked=${encodeURIComponent(word)}&kind=keyword` }
    },
    // Anchored to require an http(s) scheme so this rule can never match its
    // own redirect destination (chrome-extension://...), which would
    // otherwise create a redirect loop since the destination URL embeds the
    // keyword itself in its query string.
    condition: { urlFilter: `|http*${word}`, resourceTypes: ["main_frame"] }
  }));

  return [...domainRules, ...keywordRules];
}

async function applyRules() {
  const { blocklist = [], keywords = [] } =
    await chrome.storage.local.get(["blocklist", "keywords"]);
  const newRules = buildRules(blocklist, keywords);
  const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: oldRules.map(rule => rule.id),
    addRules: newRules
  });
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(dateStrA, dateStrB) {
  const a = new Date(dateStrA);
  const b = new Date(dateStrB);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / 86400000);
}

async function ensureInstallDate() {
  const { installDate } = await chrome.storage.local.get(["installDate"]);
  if (!installDate) {
    await chrome.storage.local.set({ installDate: todayKey() });
  }
}

async function recordBlockEvent(value, kind) {
  if (!value) return;
  const key = kind === "keyword" ? `#${value}` : value;
  const today = todayKey();

  const { stats = {} } = await chrome.storage.local.get(["stats"]);
  const byDomain = { ...(stats.byDomain || {}) };
  const byDate = { ...(stats.byDate || {}) };
  const previousLastBlockDate = stats.lastBlockDate || null;

  byDomain[key] = (byDomain[key] || 0) + 1;
  byDate[today] = (byDate[today] || 0) + 1;

  let longestStreak = stats.longestStreak || 0;
  if (previousLastBlockDate && previousLastBlockDate !== today) {
    const endedStreak = daysBetween(previousLastBlockDate, today);
    if (endedStreak > longestStreak) longestStreak = endedStreak;
  }

  await chrome.storage.local.set({
    stats: {
      totalBlocks: (stats.totalBlocks || 0) + 1,
      byDomain,
      byDate,
      lastBlockDate: today,
      longestStreak
    }
  });
}

// Tab countdown timers. Each timer is stored under its own key
// (tabTimer:<tabId>) rather than one shared object, so starting or
// cancelling a timer for one tab can never clobber a concurrent write for
// another tab — chrome.storage.local merges per-key writes atomically, but
// a read-modify-write on a single shared blob would not be safe here.
// Chrome floors alarm delays at 30s for packed/published extensions
// (unpacked/dev-mode has no floor), so MIN_TIMER_MS keeps the stored
// countdown matching when the alarm can actually fire.

const MIN_TIMER_MS = 30 * 1000;

function tabTimerKey(tabId) {
  return `tabTimer:${tabId}`;
}

chrome.runtime.onInstalled.addListener(async () => {
  await applyRules();
  await ensureInstallDate();
});
chrome.runtime.onStartup.addListener(applyRules);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case "addCurrentSite": {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const domain = normalizeDomain(tabs[0]?.url);
        if (!domain) {
          sendResponse({ ok: false });
          return;
        }

        const { blocklist = [] } = await chrome.storage.local.get(["blocklist"]);
        const nextBlocklist = uniqueClean([...blocklist, domain], normalizeDomain);
        await chrome.storage.local.set({ blocklist: nextBlocklist });
        await applyRules();
        sendResponse({ ok: true, domain });
        return;
      }

      case "refreshRules":
        await applyRules();
        sendResponse({ ok: true });
        return;

      case "recordBlockEvent":
        await recordBlockEvent(msg.value, msg.kind);
        sendResponse({ ok: true });
        return;

      case "getBlocklist": {
        const data = await chrome.storage.local.get(["blocklist"]);
        sendResponse({ blocklist: data.blocklist || [] });
        return;
      }

      case "startTabTimer": {
        const tabId = Number(msg.tabId);
        let endTime = Number(msg.endTime);
        const action = msg.action === "pause" ? "pause" : "close";

        if (!Number.isFinite(tabId) || !Number.isFinite(endTime)) {
          sendResponse({ ok: false });
          return;
        }

        // Chrome floors alarm delays at 30s for packed/published extensions
        // (unpacked/dev-mode has no floor). Clamp so the stored countdown
        // always matches when the alarm can actually fire.
        const minEndTime = Date.now() + MIN_TIMER_MS;
        const adjusted = endTime < minEndTime;
        if (adjusted) endTime = minEndTime;

        await chrome.storage.local.set({ [tabTimerKey(tabId)]: { endTime, action, startedAt: Date.now() } });
        chrome.alarms.create(`tabTimer-${tabId}`, { when: endTime });
        sendResponse({ ok: true, endTime, adjusted });
        return;
      }

      case "cancelTabTimer": {
        const tabId = Number(msg.tabId);
        await chrome.storage.local.remove(tabTimerKey(tabId));
        chrome.alarms.clear(`tabTimer-${tabId}`);
        sendResponse({ ok: true });
        return;
      }

      default:
        sendResponse({ ok: false });
    }
  })().catch(error => {
    console.error(error);
    sendResponse({ ok: false, error: error.message });
  });

  return true;
});

// ---------- Tab countdown timers ----------
// Scheduling relies on chrome.alarms so the timer still fires after the
// popup closes or the service worker goes idle.

chrome.alarms.onAlarm.addListener(async alarm => {
  if (!alarm.name.startsWith("tabTimer-")) return;

  const tabId = Number(alarm.name.slice("tabTimer-".length));
  const key = tabTimerKey(tabId);
  const stored = await chrome.storage.local.get(key);
  const info = stored[key];
  await chrome.storage.local.remove(key);

  if (!info) return;

  try {
    await chrome.tabs.get(tabId);
  } catch {
    return; // tab was already closed manually
  }

  if (info.action === "pause") {
    chrome.tabs.sendMessage(tabId, { type: "pauseVideo" }, () => {
      void chrome.runtime.lastError; // no content script / no video on this page; nothing to do
    });
  } else {
    chrome.tabs.remove(tabId).catch(() => {});
  }
});

// Clean up storage + any pending alarm if the user closes a timed tab manually.
chrome.tabs.onRemoved.addListener(async tabId => {
  chrome.alarms.clear(`tabTimer-${tabId}`);
  await chrome.storage.local.remove(tabTimerKey(tabId));
});
