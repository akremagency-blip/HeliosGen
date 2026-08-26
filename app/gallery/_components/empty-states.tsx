"use client";
import React, { useEffect, useState } from "react";
import type { Tab } from "../_shared";

const CYCLE_NAMES = ["Nano Banana Pro", "GPT Image 2", "Nano Banana 2"];

const VIDEO_CYCLE_NAMES = ["Seedance 2.0", "Kling 3.0", "Happy Horse"];

const EMPTY_IMGS = ["/1.webp", "/2.webp", "/3.webp", "/4.webp"];

export function EmptyFan({ blur }: { blur?: boolean }) {
  const configs = [
    { rot: "-10deg", rounded: false, border: true, mr: "clamp(-36px,-1.5vw,-16px)", z: 4 },
    { rot: "4deg",   rounded: false, border: true,  mr: "clamp(-36px,-1.5vw,-16px)", z: 3 },
    { rot: "180deg", rounded: true,  border: true,  mr: "clamp(-36px,-1.5vw,-16px)", z: 2 },
    { rot: "-4deg",  rounded: false, border: true,  mr: "0",                         z: 1 },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", position: blur ? "absolute" : undefined, left: blur ? "50%" : undefined, top: blur ? 0 : undefined, transform: blur ? "translateX(-50%)" : undefined, filter: blur ? "blur(32px)" : undefined, opacity: blur ? 0.4 : 1 }}>
      {configs.map((c, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginRight: c.mr, zIndex: c.z }}>
          <div style={{ transform: `rotate(${c.rot})${c.rounded ? " scaleY(-1)" : ""}` }}>
            <div style={{ position: "relative", overflow: "hidden", width: "clamp(64px,min(12vw,16vh),172px)", height: "clamp(64px,min(12vw,16vh),172px)", borderRadius: c.rounded ? "50%" : "12px", border: c.border ? "3px solid rgba(45,212,191,0.75)" : undefined, boxShadow: c.border ? "0 0 14px rgba(45,212,191,0.35), 0 0 4px rgba(45,212,191,0.2)" : undefined }}>
              <img src={EMPTY_IMGS[i]} alt="" style={{ objectFit: "cover", width: "100%", height: "100%", display: "block" }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function GalleryLoggedOut({ tab }: { tab: Tab }) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const names = tab === "videos" ? VIDEO_CYCLE_NAMES : CYCLE_NAMES;

  useEffect(() => {
    setIdx(0);
    setVisible(true);
  }, [tab]);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % names.length);
        setVisible(true);
      }, 380);
    }, 2600);
    return () => clearInterval(timer);
  }, [names]);

  return (
    <div style={{ flex: 1, background: "#0B0E14", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "clamp(12px,2.5vh,32px)", alignItems: "center", width: "100%", position: "relative" }}>
        {tab === "videos" ? <><VideoFan blur /><VideoFan /></> : <><EmptyFan blur /><EmptyFan /></>}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "8px" }}>
          <div style={{ fontFamily: "var(--font-grotesk, sans-serif)", fontWeight: 700, fontSize: "clamp(20px,min(3vw,4.5vh),36px)", lineHeight: 1, letterSpacing: "-0.56px", textTransform: "uppercase" }}>
            <p style={{ color: "#fff", margin: 0 }}>Start creating with</p>
            <p style={{ color: "#2DD4BF", margin: 0, transition: "opacity 380ms ease, transform 380ms ease", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(6px)" }}>
              {names[idx]}
            </p>
          </div>
          <p style={{ fontSize: "clamp(13px,1.2vw,15px)", color: "rgba(255,255,255,0.65)", margin: 0 }}>Describe a scene, character, mood, or style — and watch it come to life</p>
        </div>
      </div>
    </div>
  );
}

const EMPTY_VIDEOS = [
  "https://pub-2aecfc42d3474240b32b9438bf2e3905.r2.dev/videos/1768127686656-deb8718b-abdc-4482-8439-a86e3dbb9d48.mp4",
  "https://pub-2aecfc42d3474240b32b9438bf2e3905.r2.dev/videos/1768127930665-06888ffc-490f-4896-ba17-80e0de76c091.mp4",
  "https://pub-2aecfc42d3474240b32b9438bf2e3905.r2.dev/videos/1765097494972-45b681a4-b32a-4c7d-ab7a-267f40d5ccb8.mp4",
  "https://pub-2aecfc42d3474240b32b9438bf2e3905.r2.dev/videos/1768078715583-0108%20(1)(9).mp4",
];

const VIDEO_FAN_CONFIGS = [
  { rot: "-10deg", rounded: false, mr: "clamp(-36px,-1.5vw,-16px)", z: 4 },
  { rot: "4deg",   rounded: false, mr: "clamp(-36px,-1.5vw,-16px)", z: 3 },
  { rot: "180deg", rounded: true,  mr: "clamp(-36px,-1.5vw,-16px)", z: 2 },
  { rot: "-4deg",  rounded: false, mr: "0",                         z: 1 },
];

function LoopingVideo({ src }: { src: string }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = React.useState(false);

  React.useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const captureFrame = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx || !video.videoWidth) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    };

    const onPlaying = () => setPlaying(true);

    video.addEventListener("loadeddata", captureFrame);
    video.addEventListener("playing", onPlaying);
    return () => {
      video.removeEventListener("loadeddata", captureFrame);
      video.removeEventListener("playing", onPlaying);
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: playing ? 0 : 1, transition: "opacity 0.4s ease" }} />
      <video ref={videoRef} src={src} autoPlay loop muted playsInline preload="auto" style={{ objectFit: "cover", width: "100%", height: "100%", display: "block", pointerEvents: "none" }} />
    </div>
  );
}

function VideoFan({ blur }: { blur?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", position: blur ? "absolute" : undefined, left: blur ? "50%" : undefined, top: blur ? 0 : undefined, transform: blur ? "translateX(-50%)" : undefined, filter: blur ? "blur(32px)" : undefined, opacity: blur ? 0.4 : 1 }}>
      {VIDEO_FAN_CONFIGS.map((c, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginRight: c.mr, zIndex: c.z }}>
          <div style={{ transform: `rotate(${c.rot})${c.rounded ? " scaleY(-1)" : ""}` }}>
            <div style={{ position: "relative", overflow: "hidden", width: "clamp(64px,min(12vw,16vh),172px)", height: "clamp(64px,min(12vw,16vh),172px)", borderRadius: c.rounded ? "50%" : "12px", border: "3px solid rgba(45,212,191,0.75)", boxShadow: "0 0 14px rgba(45,212,191,0.35), 0 0 4px rgba(45,212,191,0.2)" }}>
              <LoopingVideo src={EMPTY_VIDEOS[i]} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
