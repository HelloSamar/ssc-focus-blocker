const bulkInput = document.getElementById("bulkInput");
const saveBulkBtn = document.getElementById("saveBulk");
const keywordInput = document.getElementById("keywordInput");
const saveKwBtn = document.getElementById("saveKeywords");
const passwordInput = document.getElementById("passwordInput");
const unlockBtn = document.getElementById("unlockBtn");
const setPasswordBtn = document.getElementById("setPasswordBtn");
const lockStatus = document.getElementById("lockStatus");
const lockoutMsg = document.getElementById("lockoutMsg");
const blocklistGrid = document.getElementById("blocklistGrid");
const siteCount = document.getElementById("siteCount");
const keywordCount = document.getElementById("keywordCount");
const siteFeedback = document.getElementById("siteFeedback");
const kwFeedback = document.getElementById("kwFeedback");
const bulkLiveCount = document.getElementById("bulkLiveCount");
const bulkInvalidMsg = document.getElementById("bulkInvalidMsg");
const kwLiveCount = document.getElementById("kwLiveCount");
const kwInvalidMsg = document.getElementById("kwInvalidMsg");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importInput = document.getElementById("importInput");
const darkModeBtn = document.getElementById("darkModeBtn");
const statsTotal = document.getElementById("statsTotal");
const statsStreak = document.getElementById("statsStreak");
const statsLongest = document.getElementById("statsLongest");
const weekChart = document.getElementById("weekChart");
const topSitesList = document.getElementById("topSitesList");
const timersList = document.getElementById("timersList");
const timerCount = document.getElementById("timerCount");

let unlocked = false;

const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 30 * 1000;
const INACTIVITY_MS = 5 * 60 * 1000;

let lockoutInterval = null;
let inactivityTimer = null;

async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

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

function uniqueClean(lines, normalizer) {
  return [...new Set(lines.map(normalizer).filter(Boolean))];
}

function analyzeLines(text, normalizer) {
  const rawLines = text.split("\n").map(l => l.trim()).filter(l => l.length);
  const valid = new Set();
  const invalid = [];
  rawLines.forEach(line => {
    const norm = normalizer(line);
    if (norm) valid.add(norm);
    else invalid.push(line);
  });
  return { valid: [...valid], invalid };
}

function setEditing(enabled) {
  bulkInput.disabled = !enabled;
  saveBulkBtn.disabled = !enabled;
  keywordInput.disabled = !enabled;
  saveKwBtn.disabled = !enabled;
  exportBtn.disabled = !enabled;
  importBtn.disabled = !enabled;
}

function showFeedback(el) {
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2000);
}

function updateLockUI() {
  setEditing(unlocked);

  if (!unlocked) {
    lockStatus.textContent = "Locked";
    lockStatus.className = "lock-status locked";
    clearTimeout(inactivityTimer);
  } else {
    lockStatus.textContent = "Unlocked";
    lockStatus.className = "lock-status unlocked";
    resetInactivityTimer();
  }

  loadData();
  renderStats();
  renderTimers();
}

// ---------- Blocklist / keyword rendering ----------

function renderBlocklist(sites, keywords) {
  blocklistGrid.innerHTML = "";
  if (!sites.length) {
    blocklistGrid.innerHTML = '<div class="empty">// no sites blocked yet</div>';
  } else {
    sites.forEach(domain => {
      const tag = document.createElement("div");
      tag.className = "domain-tag";
      tag.textContent = domain;
      blocklistGrid.appendChild(tag);
    });
  }
  siteCount.textContent = `${sites.length} site${sites.length !== 1 ? "s" : ""}`;
  keywordCount.textContent = `${keywords.length} keyword${keywords.length !== 1 ? "s" : ""}`;
}

function renderLockedPlaceholder() {
  bulkInput.value = "";
  bulkInput.placeholder = "🔒 Enter password to view blocked sites";
  keywordInput.value = "";
  keywordInput.placeholder = "🔒 Enter password to view keywords";
  blocklistGrid.innerHTML = '<div class="empty">🔒 Unlock to view blocklist</div>';
  siteCount.textContent = "🔒 hidden";
  keywordCount.textContent = "🔒 hidden";
  bulkLiveCount.textContent = "";
  bulkInvalidMsg.textContent = "";
  kwLiveCount.textContent = "";
  kwInvalidMsg.textContent = "";
}

function loadData() {
  if (!unlocked) {
    renderLockedPlaceholder();
    return;
  }

  chrome.storage.local.get(["blocklist", "keywords"], data => {
    const sites = data.blocklist || [];
    const keywords = data.keywords || [];
    bulkInput.value = sites.join("\n");
    keywordInput.value = keywords.join("\n");
    renderBlocklist(sites, keywords);
    updateLiveCounts();
  });
}

function updateLiveCounts() {
  const bulkResult = analyzeLines(bulkInput.value, normalizeDomain);
  bulkLiveCount.textContent = `${bulkResult.valid.length} valid domain${bulkResult.valid.length !== 1 ? "s" : ""}`;
  bulkInvalidMsg.textContent = bulkResult.invalid.length
    ? `⚠ ${bulkResult.invalid.length} invalid: ${bulkResult.invalid.slice(0, 3).join(", ")}${bulkResult.invalid.length > 3 ? "…" : ""}`
    : "";

  const kwResult = analyzeLines(keywordInput.value, normalizeKeyword);
  kwLiveCount.textContent = `${kwResult.valid.length} valid keyword${kwResult.valid.length !== 1 ? "s" : ""}`;
  kwInvalidMsg.textContent = kwResult.invalid.length
    ? `⚠ ${kwResult.invalid.length} invalid: ${kwResult.invalid.slice(0, 3).join(", ")}${kwResult.invalid.length > 3 ? "…" : ""}`
    : "";
}

bulkInput.addEventListener("input", updateLiveCounts);
keywordInput.addEventListener("input", updateLiveCounts);

// ---------- Security: password, rate limiting, inactivity auto-lock ----------

function showLockoutMessage(until) {
  unlockBtn.disabled = true;
  if (lockoutInterval) clearInterval(lockoutInterval);

  const tick = () => {
    const remaining = Math.ceil((until - Date.now()) / 1000);
    if (remaining <= 0) {
      clearInterval(lockoutInterval);
      lockoutInterval = null;
      unlockBtn.disabled = false;
      lockoutMsg.textContent = "";
      return;
    }
    lockoutMsg.textContent = `Too many attempts — try again in ${remaining}s`;
  };

  tick();
  lockoutInterval = setInterval(tick, 1000);
}

async function checkExistingLockout() {
  const { lockoutUntil = 0 } = await chrome.storage.local.get(["lockoutUntil"]);
  if (Date.now() < lockoutUntil) {
    showLockoutMessage(lockoutUntil);
  }
}

function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  if (!unlocked) return;
  inactivityTimer = setTimeout(() => {
    unlocked = false;
    passwordInput.value = "";
    updateLockUI();
    lockStatus.textContent = "Auto-locked (inactivity)";
    lockStatus.className = "lock-status locked";
  }, INACTIVITY_MS);
}

["click", "keydown", "input"].forEach(evt => {
  document.addEventListener(evt, () => { if (unlocked) resetInactivityTimer(); });
});

// unlockInFlight blocks re-entrant clicks synchronously (before any await),
// so rapid/scripted repeated clicks can't race the failedAttempts
// read-modify-write and dodge the lockout threshold.
let unlockInFlight = false;

unlockBtn.addEventListener("click", async () => {
  if (unlockInFlight) return;
  unlockInFlight = true;
  unlockBtn.disabled = true;
  let staysDisabled = false; // set when a lockout should keep the button disabled

  try {
    const { lockoutUntil = 0 } = await chrome.storage.local.get(["lockoutUntil"]);
    if (Date.now() < lockoutUntil) {
      showLockoutMessage(lockoutUntil);
      staysDisabled = true;
      return;
    }

    const data = await chrome.storage.local.get(["password", "passwordHash", "failedAttempts"]);
    if (!data.password && !data.passwordHash) {
      lockStatus.textContent = "No password set. Click Set Password first.";
      lockStatus.className = "lock-status focusing";
      return;
    }

    const enteredHash = await hashPassword(passwordInput.value);
    const matchesHash = data.passwordHash && enteredHash === data.passwordHash;
    const matchesLegacyPassword = data.password && passwordInput.value === data.password;

    if (matchesHash || matchesLegacyPassword) {
      if (matchesLegacyPassword) {
        await chrome.storage.local.set({ passwordHash: enteredHash });
        await chrome.storage.local.remove(["password"]);
      }
      await chrome.storage.local.set({ failedAttempts: 0, lockoutUntil: 0 });
      lockoutMsg.textContent = "";
      unlocked = true;
      passwordInput.value = "";
      updateLockUI();
    } else {
      const attempts = (data.failedAttempts || 0) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_MS;
        await chrome.storage.local.set({ failedAttempts: 0, lockoutUntil: until });
        lockStatus.textContent = "Locked";
        lockStatus.className = "lock-status locked";
        showLockoutMessage(until);
        staysDisabled = true;
      } else {
        await chrome.storage.local.set({ failedAttempts: attempts });
        lockStatus.textContent = `Wrong password (${attempts}/${MAX_ATTEMPTS})`;
        lockStatus.className = "lock-status locked";
      }
    }
  } finally {
    unlockInFlight = false;
    if (!staysDisabled) unlockBtn.disabled = false;
  }
});

setPasswordBtn.addEventListener("click", async () => {
  const pw = passwordInput.value.trim();
  if (!pw) return;
  const passwordHash = await hashPassword(pw);
  chrome.storage.local.set({ passwordHash }, async () => {
    await chrome.storage.local.remove(["password"]);
    await chrome.storage.local.set({ failedAttempts: 0, lockoutUntil: 0 });
    unlocked = true;
    passwordInput.value = "";
    updateLockUI();
    lockStatus.textContent = "Password saved";
    lockStatus.className = "lock-status unlocked";
  });
});

// ---------- Save handlers ----------

saveBulkBtn.addEventListener("click", async () => {
  if (!unlocked) return;
  const { valid: domains } = analyzeLines(bulkInput.value, normalizeDomain);

  await chrome.storage.local.set({ blocklist: domains });
  chrome.runtime.sendMessage({ type: "refreshRules" });
  loadData();
  showFeedback(siteFeedback);
});

saveKwBtn.addEventListener("click", async () => {
  if (!unlocked) return;
  const { valid: words } = analyzeLines(keywordInput.value, normalizeKeyword);

  await chrome.storage.local.set({ keywords: words });
  chrome.runtime.sendMessage({ type: "refreshRules" });
  loadData();
  showFeedback(kwFeedback);
});

// ---------- Export / Import ----------

exportBtn.addEventListener("click", async () => {
  if (!unlocked) return;
  const { blocklist = [], keywords = [] } = await chrome.storage.local.get(["blocklist", "keywords"]);
  const payload = { blocklist, keywords, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "focusguard-blocklist.json";
  a.click();
  URL.revokeObjectURL(url);
});

importBtn.addEventListener("click", () => {
  if (!unlocked) return;
  importInput.click();
});

importInput.addEventListener("change", async event => {
  if (!unlocked) return;
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const domains = uniqueClean(Array.isArray(data.blocklist) ? data.blocklist : [], normalizeDomain);
    const words = uniqueClean(Array.isArray(data.keywords) ? data.keywords : [], normalizeKeyword);

    await chrome.storage.local.set({ blocklist: domains, keywords: words });
    chrome.runtime.sendMessage({ type: "refreshRules" });
    loadData();
    showFeedback(siteFeedback);
    showFeedback(kwFeedback);
  } catch (err) {
    alert("That doesn't look like a valid FocusGuard export file.");
  } finally {
    importInput.value = "";
  }
});

// ---------- Dark mode ----------

darkModeBtn.addEventListener("click", async () => {
  const isDark = document.body.classList.toggle("dark");
  await chrome.storage.local.set({ darkMode: isDark });
  darkModeBtn.textContent = isDark ? "☀️ Light" : "🌙 Dark";
});

async function initDarkMode() {
  const { darkMode } = await chrome.storage.local.get(["darkMode"]);
  if (darkMode) {
    document.body.classList.add("dark");
    darkModeBtn.textContent = "☀️ Light";
  }
}

// ---------- Stats / progress ----------

function daysBetween(dateStrA, dateStrB) {
  const a = new Date(dateStrA);
  const b = new Date(dateStrB);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / 86400000);
}

async function renderStats() {
  if (!unlocked) {
    statsTotal.textContent = "🔒";
    statsStreak.textContent = "🔒";
    statsLongest.textContent = "🔒";
    topSitesList.innerHTML = '<div class="empty">🔒 Unlock to view</div>';
    weekChart.innerHTML = "";
    return;
  }

  const { stats = {}, installDate } = await chrome.storage.local.get(["stats", "installDate"]);
  const totalBlocks = stats.totalBlocks || 0;
  const byDate = stats.byDate || {};
  const byDomain = stats.byDomain || {};
  const today = new Date().toISOString().slice(0, 10);

  let currentStreak = 0;
  if (stats.lastBlockDate) {
    currentStreak = daysBetween(stats.lastBlockDate, today);
  } else if (installDate) {
    currentStreak = daysBetween(installDate, today);
  }

  const longestStreak = Math.max(stats.longestStreak || 0, currentStreak);

  statsTotal.textContent = `${totalBlocks}`;
  statsStreak.textContent = `${currentStreak}d`;
  statsLongest.textContent = `${longestStreak}d`;

  const topSites = Object.entries(byDomain).sort((a, b) => b[1] - a[1]).slice(0, 5);
  topSitesList.innerHTML = topSites.length
    ? topSites.map(([site, count]) => {
        const label = site.startsWith("#") ? `🔎 ${site.slice(1)}` : site;
        return `<div class="stat-row"><span>${label}</span><span>${count}</span></div>`;
      }).join("")
    : '<div class="empty">// no attempts logged yet — nice!</div>';

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ count: byDate[key] || 0, label: d.toLocaleDateString(undefined, { weekday: "short" }) });
  }
  const max = Math.max(1, ...days.map(d => d.count));
  weekChart.innerHTML = days.map(d => `
    <div class="bar-col">
      <div class="bar" style="height:${Math.max(4, (d.count / max) * 60)}px" title="${d.count} blocks"></div>
      <div class="bar-label">${d.label}</div>
    </div>
  `).join("");
}

// ---------- Tab timers ----------

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

async function renderTimers() {
  if (!unlocked) {
    timerCount.textContent = "🔒 hidden";
    timersList.innerHTML = '<div class="empty">🔒 Unlock to view</div>';
    return;
  }

  const all = await chrome.storage.local.get(null);
  const entries = Object.entries(all).filter(([key]) => key.startsWith("tabTimer:"));

  timerCount.textContent = `${entries.length} active`;

  if (!entries.length) {
    timersList.innerHTML = '<div class="empty">// no active timers</div>';
    return;
  }

  const rows = await Promise.all(entries.map(async ([key, info]) => {
    const tabId = Number(key.slice("tabTimer:".length));
    let label = "Tab";
    try {
      const tab = await chrome.tabs.get(tabId);
      label = tab.title || tab.url || "Tab";
    } catch {
      return ""; // tab no longer exists; background will clean this entry up
    }

    const remaining = info.endTime - Date.now();
    const icon = info.action === "pause" ? "⏸" : "⏱";
    return `
      <div class="timer-row">
        <span class="timer-label" title="${escapeHtml(label)}">${icon} ${escapeHtml(label)}</span>
        <span class="timer-time">${formatRemaining(remaining)}</span>
        <button class="timer-cancel" data-tab-id="${tabId}" type="button" title="Cancel timer">✕</button>
      </div>
    `;
  }));

  const html = rows.filter(Boolean).join("");
  timersList.innerHTML = html || '<div class="empty">// no active timers</div>';

  timersList.querySelectorAll(".timer-cancel").forEach(btn => {
    btn.addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ type: "cancelTabTimer", tabId: Number(btn.dataset.tabId) });
      renderTimers();
    });
  });
}

setInterval(() => { if (unlocked) renderTimers(); }, 1000);

// ---------- Init ----------

checkExistingLockout();
initDarkMode();
updateLockUI();
