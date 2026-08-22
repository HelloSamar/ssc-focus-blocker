const params = new URLSearchParams(location.search);
const blockedValue = params.get("blocked");
const kind = params.get("kind") || "domain";

if (blockedValue) {
  const label = document.getElementById("blockedLabel");
  if (label) {
    label.textContent = kind === "keyword"
      ? `Blocked — URL contains "${blockedValue}"`
      : `${blockedValue} is on your blocklist.`;
  }
  chrome.runtime.sendMessage({ type: "recordBlockEvent", value: blockedValue, kind });
}

document.getElementById("goBack").addEventListener("click", () => {
  if (history.length > 1) {
    history.back();
    return;
  }

  location.href = "about:blank";
});

document.getElementById("openList").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
