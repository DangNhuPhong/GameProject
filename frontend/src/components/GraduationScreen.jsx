import { useEffect, useState } from "react";
import graduationImage from "../assets/graduation.png";
import "./GraduationScreen.css";

export default function GraduationScreen({ onFinish }) {
  const [loaded, setLoaded] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!loaded) return;
    // Fade in for two seconds, hold the fully visible image for five.
    const timer = setTimeout(() => setFading(true), 7000);
    return () => clearTimeout(timer);
  }, [loaded]);

  useEffect(() => {
    if (!fading) return;
    // Two seconds to fade, then a brief fully black pause before returning.
    const timer = setTimeout(onFinish, 2500);
    return () => clearTimeout(timer);
  }, [fading, onFinish]);

  return (
    <div className="graduation-screen" role="dialog" aria-modal="true" aria-label="Graduation — 120 credits completed">
      <img
        className={`graduation-screen-image${loaded ? " graduation-screen-image-loaded" : ""}${fading ? " graduation-screen-image-fading" : ""}`}
        src={graduationImage}
        alt="OverNấuĂn graduation ceremony"
        onLoad={() => setLoaded(true)}
        onError={onFinish}
        draggable={false}
      />
    </div>
  );
}
