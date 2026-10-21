import { useEffect } from "react";

export default function useFullscreenHotkey(key = "f") {
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key.toLowerCase() !== key) return;
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;

      // Không kích hoạt khi đang gõ chữ (ô username, mã phòng, mật khẩu...)
      const el = e.target;
      const typing =
        el instanceof HTMLElement &&
        (el.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
      if (typing) return;

      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(console.error);
      } else {
        document.exitFullscreen();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key]);
}
