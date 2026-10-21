import {
  toggleFullscreen,
  isFullscreenSupported,
  useIsFullscreen,
} from "../useFullscreenHotkey";
import "./Fullscreenhint.css";

export default function FullscreenButton() {
  const isFs = useIsFullscreen();

  // iPhone Safari không hỗ trợ -> ẩn nút (dùng PWA "Add to Home Screen")
  if (!isFullscreenSupported()) return null;

  return (
    <button
      type="button"
      className="fs-btn"
      onClick={toggleFullscreen}
      aria-label={isFs ? "Exit fullscreen" : "Enter fullscreen"}
    >
      <span className="fs-btn__key">F</span>
      {isFs ? "to exit fullscreen" : "to fullscreen"}
    </button>
  );
}
