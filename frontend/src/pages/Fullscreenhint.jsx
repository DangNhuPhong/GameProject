import { useEffect, useState } from "react";
import "./FullscreenHint.css";

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(console.error);
  } else {
    document.exitFullscreen();
  }
}

/** Chữ "F to fullscreen" ở góc phải dưới + phím F, dùng cho mọi page. */
function FullscreenHint() {
  const [isFull, setIsFull] = useState(!!document.fullscreenElement);

  useEffect(() => {
    const onChange = () => setIsFull(!!document.fullscreenElement);

    const onKeyDown = (e) => {
      if (e.key.toLowerCase() !== "f") return;
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;

      // Không kích hoạt khi đang gõ chữ (username, mã phòng, mật khẩu...)
      const el = e.target;
      const typing =
        el instanceof HTMLElement &&
        (el.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
      if (typing) return;

      toggleFullscreen();
    };

    document.addEventListener("fullscreenchange", onChange);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <button
      type="button"
      className="fs-hint"
      onClick={(e) => {
        toggleFullscreen();
        e.currentTarget.blur(); // trả phím về game, tránh Space/Enter bấm lại nút
      }}
      aria-label={isFull ? "Exit fullscreen" : "Enter fullscreen"}
    >
      <kbd className="fs-hint-key">F</kbd>
      <span>{isFull ? "to exit fullscreen" : "to fullscreen"}</span>
    </button>
  );
}

export default FullscreenHint;
