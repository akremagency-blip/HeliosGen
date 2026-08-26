"use client";
import React, { useEffect, useRef, useState } from "react";
import type { GalleryItem } from "@/lib/galleryUtils";
import {
  galleryDrag, loadedImageUrls, naturalRatioCache, releaseImageSlot,
  renderLightboxPrompt, requestImageSlot, snapWidth, thumbSrc,
} from "../_shared";

export function GalleryCard({
  item,
  displayWidth,
  onOpen,
  onAddReference,
  onCopyPrompt,
  onDownload,
  onDelete,
  videoMuted,
  onToggleMute,
  onNaturalRatioDiscovered,
  selected,
  anySelected,
  onSelect,
  scrollContainer,
  isTagged,
  isNew,
  onMarkSeen,
}: {
  item: GalleryItem;
  displayWidth?: number;
  onOpen?: (thumbUrl: string) => void;
  onAddReference?: (url: string) => void;
  onCopyPrompt?: (prompt: string, refUrls?: string[], meta?: { model?: string; aspectRatio?: string; quality?: string; azureResolution?: string }) => void;
  onDownload?: (url: string, isVideo: boolean) => Promise<void>;
  onDelete?: (id: string, source: "generation" | "upload") => Promise<void>;
  videoMuted?: boolean;
  onToggleMute?: () => void;
  onNaturalRatioDiscovered?: () => void;
  selected?: boolean;
  anySelected?: boolean;
  onSelect?: () => void;
  scrollContainer?: React.RefObject<HTMLDivElement | null>;
  isTagged?: boolean;
  isNew?: boolean;
  onMarkSeen?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const cancelSlotRef = useRef<(() => void) | null>(null);
  const slotReleasedRef = useRef(false);
  const thumbFailedUrls = useRef<Set<string>>(new Set());
  const [thumbFailRevision, setThumbFailRevision] = useState(0);
  const lockedWidths = useRef<Map<string, number>>(new Map());
  const preloaded = loadedImageUrls.has(item.url);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(preloaded);
  const [shouldLoad, setShouldLoad] = useState(preloaded);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cardImgIdx, setCardImgIdx] = useState(0);
  const [naturalRatio, setNaturalRatio] = useState<string | null>(() => naturalRatioCache.get(item.url) ?? null);
  const [isHovered, setIsHovered] = useState(false);
  const isVideo = item.mediaType === "video";
  const allUrls = item.imageUrls ?? [item.url];
  const displayUrl = allUrls[cardImgIdx] ?? item.url;
  const isThumbFailed = thumbFailedUrls.current.has(displayUrl);
  void thumbFailRevision;
  // Lock the snapped width on first render for each URL; only ratchet up, never reshuffle on resize.
  const requested = snapWidth(displayWidth ?? 400);
  const locked = lockedWidths.current.get(displayUrl) ?? 0;
  if (requested > locked) lockedWidths.current.set(displayUrl, requested);
  const stableSnap = lockedWidths.current.get(displayUrl)!;

  // Lazy-load observer: request a concurrency slot when the card nears the viewport.
  useEffect(() => {
    if (preloaded) return;
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (isVideo) {
            setShouldLoad(true);
          } else if (!cancelSlotRef.current) {
            cancelSlotRef.current = requestImageSlot(() => setShouldLoad(true));
          }
        }
      },
      { root: scrollContainer?.current ?? null, rootMargin: "200px", threshold: 0 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelSlotRef.current?.();
      cancelSlotRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Play/pause observer: only play videos that are actually visible
  useEffect(() => {
    if (!isVideo) return;
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          videoRef.current?.play().then(() => setPlaying(true)).catch(() => {});
        } else {
          videoRef.current?.pause();
          setPlaying(false);
        }
      },
      { root: scrollContainer?.current ?? null, rootMargin: "0px", threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideo]);

  const storedRatio = (() => {
    const ar = item.aspect_ratio;
    if (!ar || ar === "auto") return null;
    const [w, h] = ar.split(":");
    return w && h ? `${w} / ${h}` : null;
  })();

  // Uploads have no stored aspect_ratio — use natural dims once known, 1/1 only while actively loading
  const cssRatio = storedRatio ?? (() => {
    if (item.source !== "upload") return null;
    if (naturalRatio) return naturalRatio;
    if (shouldLoad && !imgLoaded) return "1 / 1"; // placeholder so shimmer has height
    return null;
  })();

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (downloading) return;
    setDownloading(true);
    try { await onDownload?.(item.url, isVideo); } finally { setDownloading(false); }
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.prompt) return;
    onCopyPrompt?.(item.prompt, item.referenceImageUrls, { model: item.model, aspectRatio: item.aspect_ratio, quality: item.quality, azureResolution: item.azure_resolution });
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleAddRef = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddReference?.(item.url);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (deleting) return;
    setDeleting(true);
    try { await onDelete?.(item.id, item.source); } finally { setDeleting(false); }
  };

  if (failed) {
    return (
      <div className="gallery-item" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      className={`gallery-item${selected ? " gallery-item--selected" : ""}${anySelected ? " gallery-item--anyselected" : ""}${isTagged ? " gallery-item--tagged" : ""}`}
      draggable
      onDragStart={e => {
        e.stopPropagation();
        galleryDrag.item = { url: item.url, mediaType: item.mediaType };
        e.dataTransfer.setData("application/x-gallery-item", "1");
        e.dataTransfer.setData("text/plain", item.url);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onDragEnd={() => { galleryDrag.item = null; }}
      onMouseEnter={() => { setIsHovered(true); onMarkSeen?.(); }}
      onMouseLeave={() => setIsHovered(false)}
      onClick={anySelected ? onSelect : () => onOpen?.(isThumbFailed ? displayUrl : thumbSrc(displayUrl, stableSnap))}
    >
      {/* ── NEW badge (top-right) ── */}
      {isNew && (
        <div style={{
          position: "absolute", top: 7, right: 7, zIndex: 10,
          padding: "2px 6px", borderRadius: 999,
          background: "linear-gradient(135deg, rgba(30,100,200,0.85) 0%, rgba(20,160,140,0.85) 100%)",
          backdropFilter: "blur(6px)",
          border: "1px solid rgba(45,212,191,0.35)",
          fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
          color: "#fff", pointerEvents: "none", lineHeight: 1.4,
          textTransform: "uppercase",
        }}>
          NEW
        </div>
      )}
      {/* ── Checkbox (top-left) ── */}
      <div className="gallery-checkbox" onClick={e => { e.stopPropagation(); onSelect?.(); }}>
        {selected && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0B0E14" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </div>
      {isVideo ? (
        <>
          <video
            ref={videoRef}
            src={shouldLoad ? item.url : undefined}
            muted={videoMuted || !isHovered}
            autoPlay
            loop
            playsInline
            preload="metadata"
            draggable={false}
            onLoadedData={() => {
              setImgLoaded(true);
              loadedImageUrls.add(item.url);
            }}
            onError={() => {
              setFailed(true);
              loadedImageUrls.delete(item.url);
              try { sessionStorage.setItem("hg-loaded", JSON.stringify([...loadedImageUrls])); } catch {}
            }}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: imgLoaded ? 1 : 0, transition: "opacity 400ms ease" }}
          />
          {!playing && (
            <div className="gallery-play-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff" stroke="none"><polygon points="5 3 19 12 5 21 5 3" /></svg>
            </div>
          )}
        </>
      ) : (
        <>
          {(!shouldLoad || !imgLoaded) && <div className="gallery-shimmer" />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={displayUrl}
            src={shouldLoad ? (isThumbFailed ? displayUrl : thumbSrc(displayUrl, stableSnap)) : undefined}
            alt={item.prompt ?? ""}
            draggable={false}
            decoding="async"
            onLoad={(e) => {
              if (!slotReleasedRef.current) { slotReleasedRef.current = true; releaseImageSlot(); }
              const img = e.currentTarget;
              if (!storedRatio && item.source === "upload" && img.naturalWidth && img.naturalHeight) {
                const r = `${img.naturalWidth} / ${img.naturalHeight}`;
                if (!naturalRatioCache.has(item.url)) {
                  naturalRatioCache.set(item.url, r);
                  onNaturalRatioDiscovered?.();
                }
                setNaturalRatio(r);
              }
              setImgLoaded(true);
              loadedImageUrls.add(item.url);
            }}
            onError={() => {
              if (!isThumbFailed) {
                thumbFailedUrls.current.add(displayUrl);
                setThumbFailRevision(r => r + 1);
              } else {
                if (!slotReleasedRef.current) { slotReleasedRef.current = true; releaseImageSlot(); }
                setFailed(true);
                loadedImageUrls.delete(item.url);
                try { sessionStorage.setItem("hg-loaded", JSON.stringify([...loadedImageUrls])); } catch {}
              }
            }}
            style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", opacity: imgLoaded ? 1 : 0, transition: "opacity 400ms ease" }}
          />
          {/* Inner carousel nav — only when multiple images */}
          {allUrls.length > 1 && (
            <>
              <button
                onClick={e => { e.stopPropagation(); setImgLoaded(false); setCardImgIdx(i => Math.max(0, i - 1)); }}
                disabled={cardImgIdx === 0}
                style={{
                  position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)",
                  width: 26, height: 26, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", zIndex: 3, opacity: cardImgIdx === 0 ? 0.25 : 1,
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <button
                onClick={e => { e.stopPropagation(); setImgLoaded(false); setCardImgIdx(i => Math.min(allUrls.length - 1, i + 1)); }}
                disabled={cardImgIdx === allUrls.length - 1}
                style={{
                  position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                  width: 26, height: 26, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", zIndex: 3, opacity: cardImgIdx === allUrls.length - 1 ? 0.25 : 1,
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
              <div style={{ position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 4, zIndex: 3 }}>
                {allUrls.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={e => { e.stopPropagation(); setImgLoaded(false); setCardImgIdx(idx); }}
                    style={{
                      width: idx === cardImgIdx ? 12 : 6, height: 6, borderRadius: 3,
                      background: idx === cardImgIdx ? "#fff" : "rgba(255,255,255,0.4)",
                      border: "none", cursor: "pointer", padding: 0, transition: "all 150ms",
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Gradient overlay + prompt ── */}
      <div className="gallery-overlay">
        {item.prompt && (
          <div style={{ fontSize: "11px", lineHeight: 1.45, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", marginBottom: "4px" }}>
            {renderLightboxPrompt(item.prompt, item.referenceImageUrls)}
          </div>
        )}
        <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)" }}>
          {[item.model, item.aspect_ratio].filter(Boolean).join(" · ") || (item.source === "upload" ? "Uploaded" : "")}
        </p>
      </div>

      {/* ── Top-right icon buttons ── */}
      <div className="gallery-actions-top">
        {isVideo && (
          <button
            className="gallery-action-btn"
            onClick={e => { e.stopPropagation(); onToggleMute?.(); }}
            title={videoMuted ? "Unmute" : "Mute"}
          >
            {videoMuted ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              </svg>
            )}
          </button>
        )}
        {item.prompt && onCopyPrompt && (
          <button className="gallery-action-btn" title={copied ? "Copied!" : "Copy prompt"} onClick={handleCopy}>
            {copied ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2DD4BF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        )}
        <button
          className="gallery-action-btn"
          title={downloading ? "Downloading…" : "Download"}
          onClick={handleDownload}
          disabled={downloading}
          style={{ opacity: downloading ? 0.65 : undefined }}
        >
          {downloading ? (
            <div style={{ width: "11px", height: "11px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.2)", borderTopColor: "#fff", animation: "spin 0.75s linear infinite", flexShrink: 0 }} />
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          )}
        </button>
        {onDelete && (
          <button
            className="gallery-action-btn gallery-delete-btn"
            title="Delete"
            onClick={handleDelete}
            disabled={deleting}
            style={{ opacity: deleting ? 0.65 : undefined }}
          >
            {deleting ? (
              <div style={{ width: "11px", height: "11px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.2)", borderTopColor: "#fff", animation: "spin 0.75s linear infinite", flexShrink: 0 }} />
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* ── Bottom-left Reference button (images only) ── */}
      {!isVideo && onAddReference && (
        <div className="gallery-actions-bottom">
          <button className="gallery-ref-btn" onClick={handleAddRef}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" />
            </svg>
            Reference
          </button>
        </div>
      )}
    </div>
  );
}
