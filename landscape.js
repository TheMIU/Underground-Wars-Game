'use strict';
(() => {
  const overlay = document.getElementById('rotate-screen');
  const button = document.getElementById('rotate-action');
  const touchDevice = () => (window.navigator?.maxTouchPoints || 0) > 0 || !!window.matchMedia?.('(any-pointer: coarse)').matches;
  const canLock = () => typeof window.screen?.orientation?.lock === 'function' && typeof document.documentElement.requestFullscreen === 'function';
  let blocked = false;
  function sync() {
    const previous = blocked;
    blocked = touchDevice() && window.innerHeight > window.innerWidth;
    overlay.hidden = !blocked;
    button.hidden = !canLock();
    if (previous !== blocked) window.dispatchEvent(new Event('landscapechange'));
  }
  async function tryLandscape() {
    if (touchDevice() && canLock()) {
      try {
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
        await window.screen.orientation.lock('landscape');
      } catch {
        // Unsupported or denied locking always falls back to physical rotation.
      }
    }
    sync();
    return !blocked;
  }
  button.onclick = tryLandscape;
  window.addEventListener('resize', sync);
  window.addEventListener('orientationchange', sync);
  window.screen?.orientation?.addEventListener?.('change', sync);
  window.visualViewport?.addEventListener('resize', sync);
  window.LandscapeGate = { get blocked() { return blocked; }, tryLandscape };
  sync();
})();
