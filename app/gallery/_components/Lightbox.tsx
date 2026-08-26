"use client";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { GalleryItem } from "@/lib/galleryUtils";
import { renderLightboxPrompt, snapWidth, thumbSrc } from "../_shared";

export function Lightbox({ item, thumbUrl, onClose, onCopyPrompt, onPrev, onNext }: { item: GalleryItem; thumbUrl?: string; onClose: () => void; onCopyPrompt?: (prompt: string, refUrls?: string[], meta?: { model?: string; aspectRatio?: string; quality?: string; azureResolution?: string }) => void; onPrev?: () => void; onNext?: () => void }) {
  const [visible, setVisible] = useState(false);
  const [fullLoaded, setFullLoaded] = useState(false);
  const [imgIdx, setImgIdx] = useState(0);
  const [placeholderSrc, setPlaceholderSrc] = useState(thumbUrl ?? "");
  const [zoomed, setZoomed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [resolution, setResolution] = useState<string | null>(null);
  const allUrls = item.imageUrls ?? [item.url];
  const lightboxUrl = allUrls[imgIdx] ?? item.url;

  useEffect(() => { setImgIdx(0); setFullLoaded(false); setResolution(null); setPlaceholderSrc(thumbUrl ?? ""); }, [item.id, thumbUrl]);
  // When navigating within a multi-image item, compute a fresh placeholder from cache
  useEffect(() => { if (imgIdx > 0) { setPlaceholderSrc(thumbSrc(lightboxUrl, snapWidth(300))); setFullLoaded(false); setResolution(null); } }, [imgIdx]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const id = requestAnimationFrame(() => setVisible(true)); return () => cancelAnimationFrame(id); }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { if (zoomed) { setZoomed(false); return; } handleClose(); return; }
      if (e.key === "ArrowLeft") {
        if (imgIdx > 0) { setFullLoaded(false); setResolution(null); setImgIdx(i => i - 1); }
        else onPrev?.();
      }
      if (e.key === "ArrowRight") {
        if (imgIdx < allUrls.length - 1) { setFullLoaded(false); setResolution(null); setImgIdx(i => i + 1); }
        else onNext?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allUrls.length, imgIdx, zoomed, onPrev, onNext]);

  const handleClose = () => { setVisible(false); setTimeout(onClose, 200); };

  const isVideo = item.mediaType === "video";

  const copyPrompt = () => {
    if (!item.prompt) return;
    if (onCopyPrompt) {
      onCopyPrompt(item.prompt, item.referenceImageUrls, { model: item.model, aspectRatio: item.aspect_ratio, quality: item.quality, azureResolution: item.azure_resolution });
    } else {
      navigator.clipboard.writeText(item.prompt).catch(() => { });
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const urlExt = lightboxUrl.split("?")[0].split(".").pop()?.toLowerCase();
      const ext = isVideo ? "mp4" : (urlExt && ["png","jpg","jpeg","webp","gif"].includes(urlExt) ? urlExt : "png");
      const filename = `${isVideo ? "video" : "image"}-${item.id.slice(0, 8)}.${ext}`;
      const res = await fetch(`/api/download?url=${encodeURIComponent(lightboxUrl)}&filename=${filename}`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setDownloading(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const infoRows = [
    item.model && { label: "Model", value: item.model },
    item.quality && { label: "Quality", value: item.quality.charAt(0).toUpperCase() + item.quality.slice(1) },
    item.aspect_ratio && { label: "Aspect ratio", value: item.aspect_ratio },
    resolution && { label: "Resolution", value: resolution },
    item.source && { label: "Source", value: item.source === "generation" ? "Generated" : "Uploaded" },
    { label: "Created", value: formatDate(item.created_at) },
  ].filter(Boolean) as { label: string; value: string }[];

  const panelStyle: React.CSSProperties = {
    background: "#0B0E14",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "16px",
    overflow: "hidden",
  };

  const sectionHeaderStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: "8px",
    padding: "14px 16px 12px",
  };

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em",
    color: "rgba(255,255,255,0.4)", textTransform: "uppercase",
  };

  // When zoomed: media fills the full viewport. When not zoomed: media + right panel side by side.
  const panelWidth = 300;

  return createPortal(
    <div onClick={zoomed ? () => setZoomed(false) : handleClose} style={{
      position: "fixed", inset: 0, zIndex: 9999,
      display: "flex", alignItems: zoomed ? "center" : "flex-start", justifyContent: "center",
      background: `rgba(0,0,0,${visible ? 0.55 : 0})`,
      backdropFilter: visible ? "blur(16px)" : "none",
      WebkitBackdropFilter: visible ? "blur(16px)" : "none",
      transition: "background 200ms ease, backdrop-filter 200ms ease",
      padding: zoomed ? "0" : "24px", gap: zoomed ? "0" : "20px",
      overflowY: zoomed ? "hidden" : "auto",
    }}>

      {/* ── Media column ── */}
      <div style={{
        // When zoomed: break out of flex flow and fill the entire overlay
        position: zoomed ? "absolute" : "relative",
        inset: zoomed ? 0 : undefined,
        flex: zoomed ? undefined : 1,
        minHeight: zoomed ? undefined : "calc(100vh - 48px)",
        zIndex: zoomed ? 1 : undefined,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>

        {/* Prev button — images only */}
        {!isVideo && allUrls.length > 1 && (
          <button
            onClick={e => { e.stopPropagation(); setFullLoaded(false); setImgIdx(i => Math.max(0, i - 1)); }}
            disabled={imgIdx === 0}
            style={{
              position: "absolute", left: 16, zIndex: 10,
              width: 40, height: 40, borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.15)", background: "rgba(0,0,0,0.5)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", opacity: imgIdx === 0 ? 0.2 : 1, transition: "opacity 150ms",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
        )}

        {/* Media wrapper — click to toggle zoom */}
        <div
          onClick={e => { e.stopPropagation(); if (!isVideo) setZoomed(z => !z); }}
          style={{
            position: "relative", flexShrink: 0,
            // Zoomed: fill the column (which is already inset:0) and center content
            width: zoomed ? "100%" : undefined,
            height: zoomed ? "100%" : undefined,
            maxWidth: zoomed ? "none" : "100%",
            maxHeight: zoomed ? "none" : "calc(100vh - 48px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            transform: visible ? "scale(1)" : "scale(0.96)",
            transition: "transform 200ms ease, border-radius 280ms ease",
            borderRadius: isVideo ? "0" : (zoomed ? "0" : "12px"),
            overflow: isVideo ? "visible" : "hidden",
            boxShadow: zoomed ? "none" : "0 32px 80px rgba(0,0,0,0.6)",
            cursor: isVideo ? "default" : (zoomed ? "zoom-out" : "zoom-in"),
          }}
        >
          {isVideo ? (
            <video
              key={lightboxUrl}
              src={lightboxUrl}
              autoPlay
              loop
              playsInline
              controls
              onClick={e => e.stopPropagation()}
              onLoadedData={e => { setFullLoaded(true); const v = e.currentTarget; if (v.videoWidth && v.videoHeight) setResolution(`${v.videoWidth} × ${v.videoHeight}`); }}
              style={{
                display: "block",
                maxHeight: "100vh",
                maxWidth: "100vw",
                width: "auto",
                height: "auto",
                objectFit: "contain",
                borderRadius: zoomed ? "0" : "12px",
                cursor: "default",
              }}
            />
          ) : (
            <>
              {/* Thumbnail placeholder — already in browser cache, shows instantly */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img key={`thumb-${lightboxUrl}`} src={placeholderSrc} alt="" aria-hidden style={{
                display: "block",
                maxHeight: zoomed ? "100vh" : "calc(100vh - 48px)",
                maxWidth: zoomed ? "100vw" : "100%",
                width: "auto", height: "auto",
                opacity: fullLoaded ? 0 : 1,
                transition: "opacity 400ms ease",
              }} />
              {/* Full-res — opacity:1 immediately so browser paints rows progressively */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img key={`full-${lightboxUrl}`} src={lightboxUrl} alt={item.prompt ?? ""} onLoad={e => { setFullLoaded(true); const img = e.currentTarget; if (img.naturalWidth && img.naturalHeight) setResolution(`${img.naturalWidth} × ${img.naturalHeight}`); }} style={{
                position: "absolute", inset: 0, display: "block", width: "100%", height: "100%", objectFit: "contain",
              }} />
              {/* Dot indicators */}
              {allUrls.length > 1 && (
                <div style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 5, zIndex: 5 }}>
                  {allUrls.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={e => { e.stopPropagation(); setFullLoaded(false); setResolution(null); setImgIdx(idx); }}
                      style={{
                        width: idx === imgIdx ? 16 : 8, height: 8, borderRadius: 4,
                        background: idx === imgIdx ? "#fff" : "rgba(255,255,255,0.4)",
                        border: "none", cursor: "pointer", padding: 0, transition: "all 150ms",
                      }}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Next button — images only */}
        {!isVideo && allUrls.length > 1 && (
          <button
            onClick={e => { e.stopPropagation(); setFullLoaded(false); setImgIdx(i => Math.min(allUrls.length - 1, i + 1)); }}
            disabled={imgIdx === allUrls.length - 1}
            style={{
              position: "absolute", right: zoomed ? "16px" : 0, zIndex: 10,
              width: 40, height: 40, borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.15)", background: "rgba(0,0,0,0.5)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", opacity: imgIdx === allUrls.length - 1 ? 0.2 : 1, transition: "opacity 150ms, right 280ms ease",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        )}
      </div>

      {/* ── Right panel ── */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: `${panelWidth}px`, flexShrink: 0,
          display: "flex", flexDirection: "column", gap: "12px",
          opacity: zoomed ? 0 : visible ? 1 : 0,
          transform: zoomed ? `translateX(${panelWidth + 20}px)` : visible ? "translateX(0)" : "translateX(14px)",
          pointerEvents: zoomed ? "none" : "auto",
          transition: "opacity 260ms ease, transform 280ms ease",
          background: "rgba(10,12,14,0.85)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderRadius: "20px",
          border: "1px solid rgba(255,255,255,0.07)",
          padding: "12px",
        }}
      >
        {/* Prompt section */}
        {item.prompt && (
          <div style={panelStyle}>
            {item.referenceImageUrls && item.referenceImageUrls.length > 0 && (
              <div style={{ padding: "14px 16px 0", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {item.referenceImageUrls.map((url, i) => (
                  <div key={i} style={{ position: "relative", width: 76, height: 68, borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", flexShrink: 0 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumbSrc(url, snapWidth(76))} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    <div style={{
                      position: "absolute", bottom: 4, right: 4,
                      background: "rgba(0,0,0,0.65)", borderRadius: 4,
                      padding: "2px 5px", fontSize: 9, fontWeight: 700,
                      color: "rgba(255,255,255,0.8)", lineHeight: 1,
                    }}>
                      {i + 1}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ ...sectionHeaderStyle, justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3h6l-1 5H3z" /><path d="M3 8h6M7 3v5" /><path d="M14 3h7" /><path d="M14 8h7" /><path d="M14 13h4" /><path d="M3 13h8" /><path d="M3 18h18" />
                </svg>
                <span style={sectionLabelStyle}>Prompt</span>
              </div>
              <button
                onClick={copyPrompt}
                style={{
                  padding: "4px 12px", borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.05)",
                  color: copied ? "#2DD4BF" : "rgba(255,255,255,0.65)",
                  fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  transition: "background 140ms, color 140ms",
                  borderColor: copied ? "rgba(119,229,68,0.3)" : "rgba(255,255,255,0.1)",
                }}
                onMouseEnter={e => { if (!copied) { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#fff"; } }}
                onMouseLeave={e => { if (!copied) { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.65)"; } }}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div style={{ padding: "0 16px 16px", fontSize: "13px", lineHeight: 1.65, maxHeight: "40vh", overflowY: "auto" }}>
              {renderLightboxPrompt(item.prompt, item.referenceImageUrls)}
            </div>
          </div>
        )}

        {/* Information section */}
        <div style={panelStyle}>
          <div style={sectionHeaderStyle}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
            </svg>
            <span style={sectionLabelStyle}>Information</span>
          </div>
          {infoRows.map((row) => (
            <div key={row.label} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "13px 16px",
              borderTop: "1px solid rgba(255,255,255,0.05)",
            }}>
              <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.35)" }}>{row.label}</span>
              <span style={{ fontSize: "13px", color: "#ffffff", fontWeight: 600 }}>{row.value}</span>
            </div>
          ))}
        </div>

        {/* Download button */}
        <button
          onClick={download}
          disabled={downloading}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            width: "100%", padding: "13px 16px",
            borderRadius: "14px", border: "1px solid rgba(255,255,255,0.07)",
            background: "#0B0E14",
            color: downloading ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.75)",
            fontSize: "13px", fontWeight: 600, cursor: downloading ? "default" : "pointer",
            fontFamily: "inherit", transition: "background 140ms, color 140ms",
          }}
          onMouseEnter={e => { if (!downloading) { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#fff"; } }}
          onMouseLeave={e => { if (!downloading) { e.currentTarget.style.background = "#0B0E14"; e.currentTarget.style.color = "rgba(255,255,255,0.75)"; } }}
        >
          {downloading ? (
            <span style={{ width: 13, height: 13, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.15)", borderTopColor: "rgba(255,255,255,0.5)", display: "inline-block", animation: "spin 0.75s linear infinite" }} />
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v13M7 13l5 5 5-5" /><path d="M5 21h14" />
            </svg>
          )}
          {downloading ? "Downloading…" : "Download"}
        </button>
      </div>

      {/* ── Close button ── */}
      <button onClick={handleClose} style={{
        position: "fixed", top: "16px", right: "16px",
        width: "34px", height: "34px", borderRadius: "50%",
        border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.5)",
        color: "rgba(255,255,255,0.6)", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        opacity: visible ? 1 : 0, transition: "opacity 200ms ease, background 150ms",
      }}
        onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,0,0,0.5)"; }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
    </div>,
    document.body,
  );
}
