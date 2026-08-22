// Listens for a "pause instead of close" tab-timer expiry and pauses any
// playing <video> element on the page (covers YouTube, Twitch, and most
// other HTML5 video players without needing site-specific selectors).

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== "pauseVideo") return false;

  const videos = document.querySelectorAll("video");
  let pausedCount = 0;

  videos.forEach(video => {
    if (!video.paused) {
      video.pause();
      pausedCount += 1;
    }
  });

  sendResponse({ ok: true, videosFound: videos.length, videosPaused: pausedCount });
  return true;
});
