const blockCurrentBtn = document.getElementById("blockCurrent");
const openListBtn = document.getElementById("openList");
const statusEl = document.getElementById("status");

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

blockCurrentBtn.addEventListener("click", () => {
  blockCurrentBtn.disabled = true;
  setStatus("Blocking current site...");

  chrome.runtime.sendMessage({ type: "addCurrentSite" }, res => {
    const error = chrome.runtime.lastError;
    if (error || !res?.ok) {
      setStatus("Can't block this page", "error");
      blockCurrentBtn.disabled = false;
      return;
    }

    setStatus(`Blocked ${res.domain}`, "ok");
    setTimeout(() => window.close(), 900);
  });
});

openListBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

// ---------- Tab Timer ----------

const timerSetup = document.getElementById("timerSetup");
const timerRunning = document.getElementById("timerRunning");
const hInput = document.getElementById("hInput");
const mInput = document.getElementById("mInput");
const sInput = document.getElementById("sInput");
const pauseInsteadChk = document.getElementById("pauseInsteadChk");
const startTimerBtn = document.getElementById("startTimerBtn");
const cancelTimerBtn = document.getElementById("cancelTimerBtn");
const countdownDisplay = document.getElementById("countdownDisplay");
const countdownAction = document.getElementById("countdownAction");

let activeTabId = null;
let countdownInterval = null;

function clampInput(el, min, max) {
  let value = parseInt(el.value, 10);
  if (Number.isNaN(value)) value = min;
  el.value = Math.min(max, Math.max(min, value));
}

function wheelAdjust(el, min, max, bigStep) {
  el.addEventListener("wheel", event => {
    event.preventDefault();
    const step = bigStep && event.shiftKey ? 5 : 1;
    const delta = event.deltaY < 0 ? step : -step;
    let value = (parseInt(el.value, 10) || 0) + delta;
    value = Math.min(max, Math.max(min, value));
    el.value = value;
  }, { passive: false });
}

wheelAdjust(hInput, 0, 99, false);
wheelAdjust(mInput, 0, 59, true);
wheelAdjust(sInput, 0, 59, false);

[hInput, mInput, sInput].forEach((el, i) => {
  const bounds = [[0, 99], [0, 59], [0, 59]][i];
  el.addEventListener("change", () => clampInput(el, bounds[0], bounds[1]));
});

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function showSetupView() {
  clearInterval(countdownInterval);
  timerRunning.style.display = "none";
  timerSetup.style.display = "block";
}

function showRunningView(endTime, action) {
  timerSetup.style.display = "none";
  timerRunning.style.display = "block";
  countdownAction.textContent = action === "pause" ? "Video will pause" : "Tab will close";

  const tick = () => {
    const remaining = endTime - Date.now();
    if (remaining <= 0) {
      countdownDisplay.textContent = "00:00";
      clearInterval(countdownInterval);
      setTimeout(showSetupView, 600);
      return;
    }
    countdownDisplay.textContent = formatCountdown(remaining);
  };

  tick();
  clearInterval(countdownInterval);
  countdownInterval = setInterval(tick, 1000);
}

async function startTimer(totalMs, action) {
  if (activeTabId == null || totalMs <= 0) return;
  const endTime = Date.now() + totalMs;

  await chrome.storage.local.set({
    tabTimerDefaults: {
      h: parseInt(hInput.value, 10) || 0,
      m: parseInt(mInput.value, 10) || 0,
      s: parseInt(sInput.value, 10) || 0,
      pauseInstead: pauseInsteadChk.checked
    }
  });

  chrome.runtime.sendMessage(
    { type: "startTabTimer", tabId: activeTabId, endTime, action },
    res => {
      void chrome.runtime.lastError;
      const actualEndTime = res?.endTime || endTime;
      if (res?.adjusted) {
        setStatus("Rounded up to 30s (browser minimum)", "");
      }
      showRunningView(actualEndTime, action);
    }
  );
}

startTimerBtn.addEventListener("click", () => {
  const h = parseInt(hInput.value, 10) || 0;
  const m = parseInt(mInput.value, 10) || 0;
  const s = parseInt(sInput.value, 10) || 0;
  const totalMs = ((h * 3600) + (m * 60) + s) * 1000;

  if (totalMs <= 0) {
    setStatus("Enter a duration first", "error");
    return;
  }

  startTimer(totalMs, pauseInsteadChk.checked ? "pause" : "close");
});

cancelTimerBtn.addEventListener("click", () => {
  if (activeTabId == null) return;
  chrome.runtime.sendMessage({ type: "cancelTabTimer", tabId: activeTabId }, () => {
    void chrome.runtime.lastError;
    showSetupView();
  });
});

document.querySelectorAll(".quick-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const minutes = parseInt(btn.dataset.min, 10) || 0;
    hInput.value = Math.floor(minutes / 60);
    mInput.value = minutes % 60;
    sInput.value = 0;
    startTimer(minutes * 60 * 1000, pauseInsteadChk.checked ? "pause" : "close");
  });
});

async function initTimer() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tabs[0]?.id ?? null;

  const timerKey = activeTabId != null ? `tabTimer:${activeTabId}` : null;
  const stored = timerKey
    ? await chrome.storage.local.get([timerKey, "tabTimerDefaults"])
    : {};
  const existing = timerKey ? stored[timerKey] : null;
  const tabTimerDefaults = stored.tabTimerDefaults;

  if (existing && existing.endTime > Date.now()) {
    showRunningView(existing.endTime, existing.action);
    return;
  }

  if (tabTimerDefaults) {
    hInput.value = tabTimerDefaults.h ?? 0;
    mInput.value = tabTimerDefaults.m ?? 5;
    sInput.value = tabTimerDefaults.s ?? 0;
    pauseInsteadChk.checked = Boolean(tabTimerDefaults.pauseInstead);
  }

  showSetupView();
}

initTimer();
