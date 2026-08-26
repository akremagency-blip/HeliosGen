"use client";
// Types, pure helpers and the module-level caches that page.tsx and the gallery
// components both reach for. Split out so the leaf components could move into
// their own files without importing the page component they used to sit under.
import React from "react";

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export function randomUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const NEXT_IMG_WIDTHS = [16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840];

export function snapWidth(w: number): number {
  const target = w * 2;
  return NEXT_IMG_WIDTHS.find(s => s >= target) ?? NEXT_IMG_WIDTHS[NEXT_IMG_WIDTHS.length - 1];
}

export function thumbSrc(url: string, snapped: number): string {
  if (!url || url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("/_next/")) return url;
  // R2 URLs: use our own proxy to avoid Cloudflare ECONNRESET on Next.js's undici fetcher
  if (url.includes(".r2.dev/")) {
    return `/api/thumb?url=${encodeURIComponent(url)}&w=${snapped}`;
  }
  return `/_next/image?url=${encodeURIComponent(url)}&w=${snapped}&q=75`;
}

export interface RefImage {
  id: string;
  objectUrl: string;
  cdnUrl: string | null;
  uploading: boolean;
  error: boolean;
}

export interface PendingGen {
  id: string;
  aspectRatio: string;
  prompt: string;
  referenceImageUrls?: string[];
  error?: string;
  taskId?: string;
  createdAt?: string;
  tab?: Tab;
  prePending?: boolean;
  retried?: boolean;
  folderId?: string | null;
}

export interface DownloadTask {
  id: string;
  filename: string;
  status: "preparing" | "ready" | "error";
}

export type Tab = "images" | "videos";

export interface TaggedImage {
  label: string;
  refId: string;
  url: string;
  kind?: "image" | "video" | "audio";
}

export interface KlingElement {
  id: string;
  name: string;
  description: string;
  imageUrls: string[];
}

export function splitByMentions(
  text: string,
  baseColor: string | undefined,
  tagged: TaggedImage[],
  keyStart: number,
  onEnter: (tag: TaggedImage, rect: DOMRect) => void,
  onLeave: () => void,
  onMouseDown: (tag: TaggedImage) => void,
): { nodes: React.ReactNode[]; nextKey: number } {
  if (!tagged.length) {
    return {
      nodes: [<span key={keyStart} style={baseColor ? { color: baseColor } : undefined}>{text}</span>],
      nextKey: keyStart + 1,
    };
  }
  const sorted = [...tagged].sort((a, b) => b.label.length - a.label.length);
  const nodes: React.ReactNode[] = [];
  let k = keyStart;
  let rest = text;
  while (rest.length > 0) {
    let earliest: { idx: number; tag: TaggedImage } | null = null;
    for (const tag of sorted) {
      const idx = rest.indexOf(`@${tag.label}`);
      if (idx !== -1 && (earliest === null || idx < earliest.idx)) earliest = { idx, tag };
    }
    if (!earliest) {
      nodes.push(<span key={k++} style={baseColor ? { color: baseColor } : undefined}>{rest}</span>);
      break;
    }
    if (earliest.idx > 0) {
      nodes.push(<span key={k++} style={baseColor ? { color: baseColor } : undefined}>{rest.slice(0, earliest.idx)}</span>);
    }
    const tag = earliest.tag;
    nodes.push(
      <span
        key={k++}
        style={{ color: "#2DD4BF", fontWeight: 500, cursor: "text", pointerEvents: "auto", userSelect: "none", background: "rgba(119,229,68,0.15)", boxShadow: "0 0 0 3px rgba(119,229,68,0.15)", borderRadius: "3px" }}
        onMouseEnter={e => onEnter(tag, e.currentTarget.getBoundingClientRect())}
        onMouseLeave={onLeave}
        onMouseDown={e => { e.preventDefault(); onMouseDown(tag); }}
      >
        @{tag.label}
      </span>,
    );
    rest = rest.slice(earliest.idx + tag.label.length + 1);
  }
  return { nodes, nextKey: k };
}

export interface SavedSettings {
  prompt: string; modelId: string; aspectRatio: string;
  quality: string; count: number; duration: number; mode: string;
  sound?: boolean;
  refImageUrls?: string[];
  azureResolution?: string;
  azureCustomWidth?: number;
  azureCustomHeight?: number;
  promptTextMode?: "text" | "json" | "yaml";
  multiPromptMode?: boolean;
  vidStartFrameUrl?: string | null;
  vidEndFrameUrl?: string | null;
  vidResourceUrls?: string[];
  vidVideoRefUrl?: string | null;
  vidRefVideoUrls?: string[];
  vidRefAudioUrls?: string[];
  vidElements?: KlingElement[];
  taggedImages?: TaggedImage[];
}

export interface DropOption {
  value: string;
  label: string;
  group?: string;
  preview?: React.ReactNode;
  providerIcon?: React.ReactNode;
}

export function loadKlingElements(): KlingElement[] {
  if (typeof window === "undefined") return [];
  try { const r = localStorage.getItem("nf-kling-elements"); return r ? (JSON.parse(r) as KlingElement[]) : []; } catch { return []; }
}

export function saveKlingElements(elements: KlingElement[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem("nf-kling-elements", JSON.stringify(elements)); } catch { }
}

export function renderLightboxPrompt(
  text: string,
  refUrls: string[] | undefined,
): React.ReactNode {
  if (!refUrls?.length) {
    return <span style={{ color: "rgba(255,255,255,0.72)" }}>{text}</span>;
  }
  const parts: React.ReactNode[] = [];
  let lastEnd = 0;
  let key = 0;
  const re = /<<<image (\d+)>>>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastEnd) {
      parts.push(<span key={key++} style={{ color: "rgba(255,255,255,0.72)" }}>{text.slice(lastEnd, m.index)}</span>);
    }
    const n = parseInt(m[1]);
    const imgUrl = refUrls[n - 1];
    parts.push(
      <span key={key++} style={{
        display: "inline-flex", alignItems: "center", gap: "4px",
        background: "rgba(255,255,255,0.1)", borderRadius: "6px",
        padding: "1px 7px 1px 2px", verticalAlign: "middle",
        margin: "0 1px", fontSize: "12px", fontWeight: 600,
        color: "#ffffff", lineHeight: "20px",
      }}>
        {imgUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbSrc(imgUrl, snapWidth(20))} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />
        )}
        Image {n}
      </span>
    );
    lastEnd = m.index + m[0].length;
  }
  if (lastEnd < text.length) {
    parts.push(<span key={key++} style={{ color: "rgba(255,255,255,0.72)" }}>{text.slice(lastEnd)}</span>);
  }
  return <>{parts}</>;
}

export const loadedImageUrls = new Set<string>();
export const naturalRatioCache = new Map<string, string>(); // url → "w / h"

// Concurrency limiter: at most 4 gallery images load simultaneously.
const _imgQueue: Array<() => void> = [];
let _imgActive = 0;
const IMG_CONCURRENCY = 4;
export function requestImageSlot(fn: () => void): () => void {
  if (_imgActive < IMG_CONCURRENCY) { _imgActive++; fn(); return () => {}; }
  _imgQueue.push(fn);
  return () => { const i = _imgQueue.indexOf(fn); if (i !== -1) _imgQueue.splice(i, 1); };
}
export function releaseImageSlot() {
  _imgActive = Math.max(0, _imgActive - 1);
  const next = _imgQueue.shift();
  if (next) { _imgActive++; next(); }
}

// Module-level store for gallery drag — avoids dataTransfer.getData() browser quirks
export const galleryDrag: { item: { url: string; mediaType: string } | null } = { item: null };

// Restore previously discovered aspect ratios and loaded state from
// sessionStorage so the layout is correct immediately on cold page loads.
if (typeof window !== "undefined") {
  try {
    const ratios = JSON.parse(sessionStorage.getItem("hg-ratios") ?? "{}") as Record<string, string>;
    for (const [url, r] of Object.entries(ratios)) naturalRatioCache.set(url, r);
  } catch {}
  try {
    const loaded = JSON.parse(sessionStorage.getItem("hg-loaded") ?? "[]") as string[];
    for (const url of loaded) loadedImageUrls.add(url);
  } catch {}
}

