import { useEffect, useState } from "react";

export function lockEscape() {
  try {
    navigator.keyboard?.lock?.(["Escape"])?.catch?.(() => {});
  } catch {
    // bỏ qua
  }
}

export function unlockEscape() {
  try {
    navigator.keyboard?.unlock?.();
  } catch {
    // bỏ qua
  }
}

export function isFullscreenSupported() {
  const el = document.documentElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

export function toggleFullscreen() {
  const el = document.documentElement;

  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) {
      Promise.resolve(req.call(el)).catch(console.error);
      screen.orientation?.lock?.("landscape").catch(() => {});
    }
  } else {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) exit.call(document);
  }
}

export function useIsFullscreen() {
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    const update = () =>
      setIsFs(
        !!(document.fullscreenElement || document.webkitFullscreenElement),
      );

    document.addEventListener("fullscreenchange", update);
    document.addEventListener("webkitfullscreenchange", update);
    return () => {
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("webkitfullscreenchange", update);
    };
  }, []);

  return isFs;
}

/** Chỉ dùng trong trang game: khi đang fullscreen thì ESC mở menu, giữ ESC để thoát. */
export function useEscapeLockInFullscreen() {
  useEffect(() => {
    const onFsChange = () => {
      if (document.fullscreenElement) lockEscape();
      else unlockEscape();
    };

    // Nếu vào trang game khi đã ở fullscreen sẵn
    onFsChange();

    document.addEventListener("fullscreenchange", onFsChange);

    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      unlockEscape(); // rời trang game -> trả ESC về như cũ
    };
  }, []);
}

export default function useFullscreenHotkey(key = "f") {
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key.toLowerCase() !== key) return;
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;

      const el = e.target;
      const typing =
        el instanceof HTMLElement &&
        (el.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
      if (typing) return;

      toggleFullscreen();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key]);
}
