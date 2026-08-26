"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { IMAGE_MODELS, VIDEO_MODELS } from "@/lib/modelConfig";
import { PROVIDERS, getModelProvider, setModelProvider, modelHasProviderChoice } from "@/lib/providers";
import { useWorkflowStore } from "@/lib/store";
import type { User } from "@supabase/supabase-js";
import { Maximize2, Minimize2, ShieldAlert, X } from "lucide-react";
import { GalleryItem, getToken, galleryCache } from "@/lib/galleryUtils";
import { useFolderStore } from "@/lib/folderStore";
import { MediaPickerModal } from "@/components/MediaPickerModal";
import { useSidebar } from "@/components/ui/sidebar";
import { QuickAssist } from "@/components/QuickAssist";
import DotCanvasBackground from "@/components/ui/DotCanvasBackground";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Button } from "@/components/ui/button";
import { browserNotify, requestNotificationPermission } from "@/lib/browserNotify";
import {
  DEMO_MODE, galleryDrag, loadedImageUrls, naturalRatioCache, randomUUID,
  snapWidth, thumbSrc,
  type DownloadTask, type KlingElement, type PendingGen,
  type RefImage, type SavedSettings, type Tab, type TaggedImage,
  getDisplayOrder, isAzureActiveForModel, loadSettings, mergeByNewest,
  removeTagAndRenumber, renderGalleryMentions, reorderAndRenumberTags,
  reorderDrag, resizeTextarea, resolveGalleryMentions, saveSettings,
} from "./_shared";
import { GALLERY_CSS } from "./_gallery-css";
import { DEMO_GALLERY_ITEMS, DEMO_VIDEO_ITEMS } from "./_demo-items";
import { PendingGenTile } from "./_components/PendingGenTile";
import { GalleryCard } from "./_components/GalleryCard";
import { DownloadToast } from "./_components/DownloadToast";
import { Lightbox } from "./_components/Lightbox";
import { GalleryLoggedOut } from "./_components/empty-states";
import { syntaxHighlightJson, syntaxHighlightYaml } from "./_components/highlight";
import {
  AspectRatioDropdown, CustomDropdown, DiamondIcon, ElementPickerModal,
  ProviderBackendIcon, ProviderIcon,
} from "./_components/dropdowns";























// ── Tag renumbering helper ─────────────────────────────────────────────────────




// ── Inner page ────────────────────────────────────────────────────────────────

function GalleryInner() {
  const { state, isMobile } = useSidebar();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab = (rawTab === "videos" ? "videos" : "images") as Tab;
  const rawSource = searchParams.get("source");
  const initialSource = (rawSource === "uploaded" ? "uploaded" : "generated") as "generated" | "uploaded";

  const { selectedFolderId, itemFolderMap, assignItemsToFolder, removeItemsFromFolder, folders, addUnseenFolder } = useFolderStore();

  const [user, setUser] = useState<User | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);

  const [items, setItems] = useState<GalleryItem[]>(() => {
    if (DEMO_MODE) return tab === "images" ? DEMO_GALLERY_ITEMS : DEMO_VIDEO_ITEMS;
    const initSrc = initialSource === "uploaded" ? "upload" : "generation";
    return galleryCache.get(`${tab}-${initSrc}`)?.items ?? [];
  });
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(() => {
    if (DEMO_MODE) return false;
    const initSrc = initialSource === "uploaded" ? "upload" : "generation";
    return galleryCache.get(`${tab}-${initSrc}`)?.hasMore ?? true;
  });
  const [lightboxItem, setLightboxItem] = useState<GalleryItem | null>(null);
  const [lightboxThumb, setLightboxThumb] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const anySelected = selectedIds.size > 0;
  const toggleSelect = (id: string) => setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const clearSelection = () => { setSelectedIds(new Set()); setFolderPickerOpen(false); };
  const marqueeStartRef = useRef<{x: number; y: number} | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<{x: number; y: number; w: number; h: number} | null>(null);
  const marqueeRectRef = useRef<{x: number; y: number; w: number; h: number} | null>(null);
  const isDraggingMarqueeRef = useRef(false);
  const wasDraggingRef = useRef(false);
  const preDragSelectedIdsRef = useRef<Set<string>>(new Set());

  const isVideo = tab === "videos";
  const models = isVideo ? VIDEO_MODELS : IMAGE_MODELS;

  const skipNextModelEffect = useRef(false);

  const [prompt, setPrompt] = useState<string>(() => loadSettings(tab, selectedFolderId)?.prompt ?? "");
  const prevFolderIdRef = useRef<string | null>(selectedFolderId);
  const settingsSnapshotRef = useRef<SavedSettings | null>(null);
  const [modelId, setModelId] = useState<string>(() => {
    const s = loadSettings(tab, selectedFolderId);
    return (s?.modelId && models.find(m => m.id === s.modelId)) ? s.modelId : models[0].id;
  });
  const [aspectRatio, setAspectRatio] = useState<string>(() => {
    const s = loadSettings(tab, selectedFolderId);
    const mId = (s?.modelId && models.find(m => m.id === s.modelId)) ? s.modelId : models[0].id;
    const mdl = models.find(m => m.id === mId) ?? models[0];
    const azureOpts = (mdl as { azureResolutionOptions?: string[] }).azureResolutionOptions;
    if (s?.aspectRatio === "custom" && Number.isFinite(s.azureCustomWidth) && Number.isFinite(s.azureCustomHeight) && isAzureActiveForModel(mId, azureOpts)) {
      return "custom";
    }
    if (s?.aspectRatio && mdl.ratios.includes(s.aspectRatio)) return s.aspectRatio;
    return ("defaultRatio" in mdl ? (mdl as { defaultRatio: string }).defaultRatio : null) ?? mdl.ratios[0] ?? "1:1";
  });
  const [azureCustomWidth, setAzureCustomWidth] = useState<number | undefined>(() => loadSettings(tab, selectedFolderId)?.azureCustomWidth);
  const [azureCustomHeight, setAzureCustomHeight] = useState<number | undefined>(() => loadSettings(tab, selectedFolderId)?.azureCustomHeight);
  const [quality, setQuality] = useState<string>(() => loadSettings(tab, selectedFolderId)?.quality ?? "2k");
  const [isAzureProvider, setIsAzureProvider] = useState<boolean>(false);
  const [providerId, setProviderId] = useState<ReturnType<typeof getModelProvider>>("kie");
  const [count, setCount] = useState<number>(() => loadSettings(tab, selectedFolderId)?.count ?? 1);
  const [duration, setDuration] = useState<number>(() => loadSettings(tab, selectedFolderId)?.duration ?? 5);
  const [mode, setMode] = useState<string>(() => loadSettings(tab, selectedFolderId)?.mode ?? "");
  const [resolution, setResolution] = useState<string>("");
  const [azureResolution, setAzureResolution] = useState<string>(() => loadSettings(tab, selectedFolderId)?.azureResolution ?? "1k");
  const [sound, setSound] = useState<boolean>(() => loadSettings(tab, selectedFolderId)?.sound ?? false);
  const [seed, setSeed] = useState<number | undefined>(0);
  const [durPickerOpen, setDurPickerOpen] = useState(false);
  const [durPickerClosing, setDurPickerClosing] = useState(false);
  const [durPickerPos, setDurPickerPos] = useState<{ left: number; bottom: number } | null>(null);
  const durPillRef = useRef<HTMLButtonElement>(null);
  const durCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingGens, setPendingGens] = useState<PendingGen[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem("aiui-pending-gens");
      // Strip prePending on restore — on page refresh, skip the 3-second delay
      const parsed = stored ? (JSON.parse(stored) as PendingGen[]) : [];
      return parsed.map(p => ({ ...p, prePending: false }));
    } catch { return []; }
  });
  const prePendingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingGensRef = useRef(pendingGens);
  useEffect(() => {
    if (!("caches" in window)) return;
    const CACHE_NAME = "hg-empty-state-v1";
    // Only cache same-origin assets — cross-origin video URLs require CORS headers
    // on the remote server which aren't configured, causing fetch errors.
    const ASSETS = ["/1.webp", "/2.webp", "/3.webp", "/4.webp"];
    caches.open(CACHE_NAME).then(cache => {
      ASSETS.forEach(url => {
        cache.match(url).then(hit => {
          if (!hit) cache.add(url).catch(() => {});
        });
      });
    });
  }, []);

  useEffect(() => { pendingGensRef.current = pendingGens; }, [pendingGens]);

  // Sync active-generation folders to the sidebar
  useEffect(() => {
    const ids = [...new Set(
      pendingGens.filter(pg => !pg.error && pg.folderId).map(pg => pg.folderId!)
    )];
    useFolderStore.getState().setGeneratingFolderIds(ids);
    const hasNullFolderGen = pendingGens.some(pg => !pg.error && !pg.folderId);
    useFolderStore.getState().setGeneratingAllAssets(hasNullFolderGen);
  }, [pendingGens]);

  const [newItemIds, setNewItemIds] = useState<Set<string>>(new Set());
  const onGenComplete = React.useCallback((folderId: string | null | undefined, freshIds: string[]) => {
    if (folderId && folderId !== useFolderStore.getState().selectedFolderId) {
      useFolderStore.getState().addUnseenFolder(folderId);
    }
    if (!folderId && useFolderStore.getState().selectedFolderId !== null) {
      useFolderStore.getState().setUnseenAllAssets(true);
    }
    if (freshIds.length > 0) {
      setNewItemIds(prev => { const n = new Set(prev); freshIds.forEach(id => n.add(id)); return n; });
    }
  }, []);
  const [submitting, setSubmitting] = useState(false);
  const [veoMode, setVeoMode] = useState<"frames" | "references">("frames");
  const [promptTextMode, setPromptTextMode] = useState<"text" | "json" | "yaml">(() => loadSettings(tab, selectedFolderId)?.promptTextMode ?? "text");
  const [multiPromptMode, setMultiPromptMode] = useState<boolean>(() => loadSettings(tab, selectedFolderId)?.multiPromptMode ?? false);
  const [expandedPromptIdx, setExpandedPromptIdx] = useState<number | null>(null);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [genError, setGenError] = useState<string>("");
  const debugMode        = useWorkflowStore((s) => s.debugMode);
  const addToast         = useWorkflowStore((s) => s.addToast);
  const kieKeySet        = useWorkflowStore((s) => s.kieKeySet);
  const setKieKeySet     = useWorkflowStore((s) => s.setKieKeySet);
  const setAuthModalOpen = useWorkflowStore((s) => s.setAuthModalOpen);
  const [sourceFilter, setSourceFilter] = useState<"generated" | "uploaded">(initialSource);

  useEffect(() => {
    if (rawSource === "uploaded" || rawSource === "generated") {
      setSourceFilter(rawSource);
    }
  }, [rawSource]);
  const [zoom, setZoom] = useState<number>(() => {
    if (typeof window === "undefined") return 6;
    const saved = localStorage.getItem("aiui-gallery-zoom");
    return saved ? parseInt(saved, 10) : 6;
  });
  const gridRef = useRef<HTMLDivElement>(null);
  const gridOuterRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [natRatioVersion, setNatRatioVersion] = useState(0);
  const [downloads, setDownloads] = useState<DownloadTask[]>([]);
  const [refError, setRefError] = useState("");

  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [videoMuted, setVideoMuted] = useState(true);
  const [refPreview, setRefPreview] = useState<{ url: string; mediaKind: "image" | "video" | "audio" } | null>(null);
  const [hoveredRefId, setHoveredRefId] = useState<string | null>(null);

  // Folder picker (multi-select toolbar)
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const folderPickerRef = useRef<HTMLDivElement>(null);
  const folderPickerBtnRef = useRef<HTMLButtonElement>(null);
  const [expandedPickerFolders, setExpandedPickerFolders] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!folderPickerOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (
        folderPickerRef.current && !folderPickerRef.current.contains(e.target as Node) &&
        folderPickerBtnRef.current && !folderPickerBtnRef.current.contains(e.target as Node)
      ) {
        setFolderPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [folderPickerOpen]);

  useEffect(() => {
    const MIN_DRAG = 5;
    const selectIntersecting = (r: {x: number; y: number; w: number; h: number}) => {
      if (!gridOuterRef.current) return;
      const toAdd: string[] = [];
      gridOuterRef.current.querySelectorAll<HTMLElement>("[data-item-id]").forEach(el => {
        const b = el.getBoundingClientRect();
        if (b.right > r.x && b.left < r.x + r.w && b.bottom > r.y && b.top < r.y + r.h) {
          const id = el.getAttribute("data-item-id");
          if (id) toAdd.push(id);
        }
      });
      setSelectedIds(() => {
        const s = new Set(preDragSelectedIdsRef.current);
        toAdd.forEach(id => s.add(id));
        return s;
      });
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!marqueeStartRef.current) return;
      const dx = e.clientX - marqueeStartRef.current.x;
      const dy = e.clientY - marqueeStartRef.current.y;
      if (!isDraggingMarqueeRef.current) {
        if (Math.abs(dx) < MIN_DRAG && Math.abs(dy) < MIN_DRAG) return;
        isDraggingMarqueeRef.current = true;
      }
      const x1 = Math.min(marqueeStartRef.current.x, e.clientX);
      const y1 = Math.min(marqueeStartRef.current.y, e.clientY);
      const x2 = Math.max(marqueeStartRef.current.x, e.clientX);
      const y2 = Math.max(marqueeStartRef.current.y, e.clientY);
      const r = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
      marqueeRectRef.current = r;
      setMarqueeRect(r);
      selectIntersecting(r);
    };
    const onMouseUp = () => {
      const wasDragging = isDraggingMarqueeRef.current;
      marqueeStartRef.current = null;
      isDraggingMarqueeRef.current = false;
      marqueeRectRef.current = null;
      setMarqueeRect(null);
      if (wasDragging) {
        wasDraggingRef.current = true;
        setTimeout(() => { wasDraggingRef.current = false; }, 80);
      }
    };
    const onClickCapture = (e: MouseEvent) => {
      if (wasDraggingRef.current) { e.stopPropagation(); e.preventDefault(); }
    };
    // Prevent native drag-and-drop from stealing mousemove events during marquee
    const onDragStart = (e: DragEvent) => {
      if (marqueeStartRef.current) e.preventDefault();
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("dragstart", onDragStart, true);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("dragstart", onDragStart, true);
    };
  }, []);

  // Media picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<"refImage" | "startFrame" | "endFrame" | "resource" | "videoRef" | "referenceVideo" | null>(null);
  const pickerTargetRef = useRef<typeof pickerTarget>(null);
  const [pickerUploadKind, setPickerUploadKind] = useState<"image" | "video">("image");
  const [dragOverSlotKey, setDragOverSlotKey] = useState<string | null>(null);
  const [reorderOverId, setReorderOverId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Reference images — restored from localStorage on mount
  const [refImages, setRefImages] = useState<RefImage[]>(() => {
    const s = loadSettings(tab, selectedFolderId);
    return (s?.refImageUrls ?? []).map(url => ({
      id: url, objectUrl: url, cdnUrl: url, uploading: false, error: false,
    }));
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Video reference state
  const urlToRef = (url: string): RefImage => ({ id: url, objectUrl: url, cdnUrl: url, uploading: false, error: false });
  const [vidStartFrame, setVidStartFrame] = useState<RefImage | null>(() => { const u = loadSettings(tab, selectedFolderId)?.vidStartFrameUrl; return u ? urlToRef(u) : null; });
  const [vidEndFrame, setVidEndFrame]     = useState<RefImage | null>(() => { const u = loadSettings(tab, selectedFolderId)?.vidEndFrameUrl;   return u ? urlToRef(u) : null; });
  const [vidResources, setVidResources]   = useState<RefImage[]>(() => (loadSettings(tab, selectedFolderId)?.vidResourceUrls ?? []).map(urlToRef));
  const [vidVideoRef, setVidVideoRef]     = useState<RefImage | null>(() => { const u = loadSettings(tab, selectedFolderId)?.vidVideoRefUrl;   return u ? urlToRef(u) : null; });
  const [vidRefVideos, setVidRefVideos]   = useState<RefImage[]>(() => (loadSettings(tab, selectedFolderId)?.vidRefVideoUrls ?? []).map(urlToRef));
  const [vidRefAudios, setVidRefAudios]   = useState<RefImage[]>(() => (loadSettings(tab, selectedFolderId)?.vidRefAudioUrls ?? []).map(urlToRef));
  const [vidElements, setVidElements]     = useState<KlingElement[]>(() => loadSettings(tab, selectedFolderId)?.vidElements ?? []);
  const [elementPickerOpen, setElementPickerOpen] = useState(false);
  const vidImgInputRef   = useRef<HTMLInputElement>(null);
  const vidVideoInputRef = useRef<HTMLInputElement>(null);
  const vidAudioInputRef = useRef<HTMLInputElement>(null);
  const vidPickTarget = useRef<"startFrame" | "endFrame" | "resource" | "videoRef" | "referenceVideo" | "audioRef" | null>(null);

  // Prompt expansion

  // @ mention state — tagged images also restored from localStorage
  const [taggedImages, setTaggedImages] = useState<TaggedImage[]>(() => {
    const s = loadSettings(tab, selectedFolderId);
    if (s?.taggedImages?.length) return s.taggedImages;
    // fallback: reconstruct from refImageUrls for backwards compat
    const urls = s?.refImageUrls ?? [];
    const p = s?.prompt ?? "";
    return urls.flatMap((url, idx) => {
      const label = `image${idx + 1}`;
      return p.includes(`@${label}`) ? [{ label, refId: url, url }] : [];
    });
  });
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionSelIdx, setMentionSelIdx] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeBlockRef = useRef<HTMLTextAreaElement | null>(null);
  const activeBlockIdxRef = useRef<number | null>(null);
  const promptBarRef = useRef<HTMLDivElement>(null);
  const overlayInnerRef = useRef<HTMLDivElement>(null);
  const [chipPreview, setChipPreview] = useState<{ tag: TaggedImage; rect: DOMRect } | null>(null);

  const pageRef = useRef(0);
  const tabRef = useRef<Tab>(tab);
  const sourceFilterRef = useRef<"generated" | "uploaded">(initialSource);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const postLoadCheckRef = useRef<() => void>(() => {});
  const prevScrollHeightRef = useRef(0);
  const [windowWidth, setWindowWidth] = useState(0);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => { refImages.forEach(r => URL.revokeObjectURL(r.objectUrl)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Close ref preview on Escape
  useEffect(() => {
    if (!refPreview) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setRefPreview(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [refPreview]);

  // Persist pendingGens so generating/failed jobs survive page refresh
  useEffect(() => {
    try { localStorage.setItem("aiui-pending-gens", JSON.stringify(pendingGens)); } catch { }
  }, [pendingGens]);

  // Handle "Clean failed jobs" dispatched from the sidebar
  useEffect(() => {
    function handle(e: Event) {
      const { folderId } = (e as CustomEvent<{ folderId: string | null }>).detail;
      setPendingGens(prev => prev.filter(pg => {
        if (!pg.error) return true;
        if (folderId === null) return false;
        return pg.folderId !== folderId;
      }));
    }
    window.addEventListener("clean-failed-jobs", handle);
    return () => window.removeEventListener("clean-failed-jobs", handle);
  }, []);

  // On mount, resume polling for any pending gens that were in-flight before the refresh
  useEffect(() => {
    const toResume = pendingGens.filter(p => p.taskId && !p.error);
    toResume.forEach(async (pending) => {
      try {
        // Check immediately (no 3s delay) before entering the regular poll loop
        const immediateRes = await fetch(`/api/job-status?taskId=${pending.taskId!}`);
        const immediateResult = await immediateRes.json() as { status: string; error?: string };
        if (immediateResult.status === "error") throw new Error(immediateResult.error ?? "Generation failed");
        if (immediateResult.status === "not_found") {
          // Task expired from server memory — image was likely already saved; just remove the spinner
          setPendingGens(prev => prev.filter(p => p.id !== pending.id));
          return;
        }
        if (immediateResult.status !== "done") {
          // Still generating — enter the regular poll loop
          await pollTask(pending.taskId!);
        }
        const existingIds = new Set((galleryCache.get(`${tabRef.current}-generation`)?.items ?? []).map((i: GalleryItem) => i.id));
        const fresh = await fetchNewItems(tabRef.current);
        setPendingGens(prev => prev.filter(p => p.id !== pending.id));
        if (fresh.length > 0) {
          if (pending.folderId) {
            const existingMap = useFolderStore.getState().itemFolderMap;
            const pendingTime = pending.createdAt ? new Date(pending.createdAt).getTime() - 30_000 : 0;
            const untaggedIds = fresh
              .filter(i => new Date(i.created_at).getTime() >= pendingTime)
              .map(i => i.id)
              .filter(id => !existingMap[id]);
            if (untaggedIds.length > 0) assignItemsToFolder(untaggedIds, pending.folderId);
          }
          const genCacheKey = `${tabRef.current}-generation`;
          setItems(prev => {
            const base = sourceFilterRef.current === "generated" ? prev : (galleryCache.get(genCacheKey)?.items ?? []);
            const merged = mergeByNewest(base, fresh);
            galleryCache.set(genCacheKey, { items: merged, hasMore: true });
            return sourceFilterRef.current === "generated" ? (merged === base ? prev : merged) : prev;
          });
        }
        onGenComplete(pending.folderId, fresh.filter(i => !existingIds.has(i.id)).map(i => i.id));
        window.dispatchEvent(new Event("credits-refresh"));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setPendingGens(prev => prev.map(p => p.id === pending.id ? { ...p, error: msg } : p));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auth ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (DEMO_MODE) {
      setUser({ id: "demo" } as unknown as User);
      setKieKeySet(false);
      setAuthLoaded(true);
      return;
    }
    if (process.env.NEXT_PUBLIC_GUEST_MODE === "true") {
      setUser({ id: "guest" } as unknown as User);
      setAuthLoaded(true);
      return;
    }
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.access_token) {
        fetch("/api/settings/kie-key", { headers: { Authorization: `Bearer ${session.access_token}` } })
          .then(r => r.json())
          .then(d => setKieKeySet(!!d.hasToken))
          .catch(() => setKieKeySet(false))
          .finally(() => setAuthLoaded(true));
      } else {
        setKieKeySet(null);
        setAuthLoaded(true);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Load items ────────────────────────────────────────────────────────────

  const loadItems = useCallback(async (currentTab: Tab, page: number, replace = false) => {
    if (DEMO_MODE) {
      const demoItems = currentTab === "images" ? DEMO_GALLERY_ITEMS : DEMO_VIDEO_ITEMS;
      setItems(demoItems);
      setHasMore(false);
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    // Apply cache / loading state synchronously before any await so the UI
    // updates in the very next render rather than after the token promise.
    const apiSource = sourceFilterRef.current === "uploaded" ? "upload" : "generation";
    const cacheKey = `${currentTab}-${apiSource}`;
    if (replace) {
      const cached = galleryCache.get(cacheKey);
      if (cached) { setItems(cached.items); setHasMore(cached.hasMore); }
      else setLoading(true);
    } else {
      loadingMoreRef.current = true; // synchronous lock — prevents concurrent fetches before React re-renders
      setLoadingMore(true);
    }
    const token = await getToken();
    if (!token) { setLoading(false); setLoadingMore(false); return; }
    try {
      const genType = currentTab === "videos" ? "video" : "image";
      const res = await fetch(`/api/gallery?type=${genType}&page=${page}&source=${apiSource}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const { items: newItems, hasMore: more, total } = await res.json() as { items: GalleryItem[]; hasMore: boolean; total?: number };
      if (replace) {
        setItems(newItems);
        galleryCache.set(cacheKey, { items: newItems, hasMore: more });
      } else {
        setItems(prev => {
          const merged = mergeByNewest(prev, newItems);
          galleryCache.set(cacheKey, { items: merged, hasMore: more });
          return merged;
        });
      }
      setHasMore(more);
      pageRef.current = page;
      if (typeof total === "number") {
        useFolderStore.getState().setGalleryCount(currentTab, total);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
      loadingMoreRef.current = false;
      // Only auto-trigger next load if visible content didn't grow (all-filtered pages)
      // or the grid doesn't fill the viewport. Skip when a folder is active — the sparse
      // match rate would cascade into many empty-page fetches; let scroll drive it instead.
      requestAnimationFrame(() => {
        const el = gridOuterRef.current;
        if (!el || !hasMoreRef.current) return;
        if (useFolderStore.getState().selectedFolderId) return;
        const grew = el.scrollHeight > prevScrollHeightRef.current;
        const fillsViewport = el.scrollHeight > el.clientHeight + 1;
        if (!fillsViewport || !grew) postLoadCheckRef.current();
      });
    }
  }, []);

  // Fetches page 0 and returns only brand-new items (not already in the list).
  // Returns data without touching state so callers can batch it with other updates.
  const fetchNewItems = useCallback(async (currentTab: Tab): Promise<GalleryItem[]> => {
    const token = await getToken();
    if (!token) return [];
    try {
      const genType = currentTab === "videos" ? "video" : "image";
      const res = await fetch(`/api/gallery?type=${genType}&page=0&source=generation`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const { items: fresh } = await res.json() as { items: GalleryItem[]; hasMore: boolean };
      return fresh;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    if (!authLoaded) return;
    if (kieKeySet === null && process.env.NEXT_PUBLIC_GUEST_MODE !== "true") return;
    loadItems(tab, 0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoaded, kieKeySet]);

  useEffect(() => {
    clearSelection();
    tabRef.current = tab;
    pageRef.current = 0;
    setHasMore(true);
    if (DEMO_MODE) {
      setItems(tab === "images" ? DEMO_GALLERY_ITEMS : DEMO_VIDEO_ITEMS);
      setHasMore(false);
    } else {
      const src = sourceFilterRef.current === "uploaded" ? "upload" : "generation";
      const cached = galleryCache.get(`${tab}-${src}`);
      if (cached) { setItems(cached.items); setHasMore(cached.hasMore); } else setItems([]);
      if (user) loadItems(tab, 0, true);
    }
    const newModels = tab === "videos" ? VIDEO_MODELS : IMAGE_MODELS;
    const saved = loadSettings(tab, prevFolderIdRef.current);
    const model = (saved?.modelId ? newModels.find(m => m.id === saved.modelId) : null) ?? newModels[0];
    const azureOpts = (model as { azureResolutionOptions?: string[] }).azureResolutionOptions;
    const savedIsCustom = saved?.aspectRatio === "custom" && Number.isFinite(saved.azureCustomWidth) && Number.isFinite(saved.azureCustomHeight) && isAzureActiveForModel(model.id, azureOpts);
    const savedAR = savedIsCustom ? "custom" : (saved?.aspectRatio && model.ratios.includes(saved.aspectRatio) ? saved.aspectRatio : null);
    skipNextModelEffect.current = true;
    setModelId(model.id);
    const resolvedPrompt = saved?.prompt ?? "";
    setPrompt(resolvedPrompt);
    setAspectRatio(savedAR ?? ("defaultRatio" in model ? (model as { defaultRatio: string }).defaultRatio : null) ?? model.ratios[0] ?? "16:9");
    setAzureCustomWidth(saved?.azureCustomWidth);
    setAzureCustomHeight(saved?.azureCustomHeight);
    setQuality(saved?.quality ?? "2k");
    setCount(saved?.count ?? 1);
    if ("defaultDuration" in model) setDuration(saved?.duration ?? (model as { defaultDuration: number }).defaultDuration ?? 5);
    if ("defaultMode" in model) setMode(saved?.mode ?? (model as { defaultMode: string }).defaultMode ?? "");
    if ("defaultResolution" in model) setResolution((model as { defaultResolution: string }).defaultResolution);
    setSound(saved?.sound ?? false);
    const savedUrls = saved?.refImageUrls ?? [];
    const savedPrompt = resolvedPrompt;
    setRefImages(prev => {
      prev.forEach(r => URL.revokeObjectURL(r.objectUrl));
      return savedUrls.map(url => ({ id: url, objectUrl: url, cdnUrl: url, uploading: false, error: false }));
    });
    setTaggedImages(
      saved?.taggedImages?.length
        ? saved.taggedImages
        : savedUrls.flatMap((url, idx) => {
            const label = `image${idx + 1}`;
            return savedPrompt.includes(`@${label}`) ? [{ label, refId: url, url }] : [];
          })
    );
    const toRef = (url: string): RefImage => ({ id: url, objectUrl: url, cdnUrl: url, uploading: false, error: false });
    setVidStartFrame(saved?.vidStartFrameUrl ? toRef(saved.vidStartFrameUrl) : null);
    setVidEndFrame(saved?.vidEndFrameUrl ? toRef(saved.vidEndFrameUrl) : null);
    setVidResources((saved?.vidResourceUrls ?? []).map(toRef));
    setVidVideoRef(saved?.vidVideoRefUrl ? toRef(saved.vidVideoRefUrl) : null);
    setVidRefVideos((saved?.vidRefVideoUrls ?? []).map(toRef));
    setVidRefAudios((saved?.vidRefAudioUrls ?? []).map(toRef));
    setVidElements(saved?.vidElements ?? []);
    const restoredPrompt = resolvedPrompt;
    if (restoredPrompt && inputRef.current) {
      const el = inputRef.current;
      requestAnimationFrame(() => requestAnimationFrame(() => resizeTextarea(el)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Resize textarea on initial mount if a saved prompt is already loaded
  useEffect(() => {
    if (inputRef.current && prompt && !multiPromptMode) {
      const el = inputRef.current;
      requestAnimationFrame(() => requestAnimationFrame(() => resizeTextarea(el)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (inputRef.current && !multiPromptMode) {
      const maxH = promptExpanded ? window.innerHeight * 0.75 - 220 : 264;
      requestAnimationFrame(() => { if (inputRef.current) resizeTextarea(inputRef.current, maxH); });
    }
  }, [promptExpanded, multiPromptMode]);

  useEffect(() => {
    if (skipNextModelEffect.current) { skipNextModelEffect.current = false; return; }
    const m = models.find(m => m.id === modelId);
    if (!m) return;
    setAspectRatio(("defaultRatio" in m ? m.defaultRatio : null) ?? m.ratios[0] ?? "1:1");
    if ("defaultDuration" in m) setDuration(m.defaultDuration ?? 5);
    if ("defaultMode" in m) setMode(m.defaultMode ?? "");
    if ("defaultResolution" in m) setResolution((m as { defaultResolution: string }).defaultResolution);
    if (!isVideo) {
      const im = m as { apiInput?: { qualityOptions?: string[] }; azureQualityOptions?: string[] };
      const provider = (() => { try { return JSON.parse(localStorage.getItem("aiui-model-providers") ?? "{}")[m.id] ?? "kie"; } catch { return "kie"; } })();
      const base     = (() => { try { return localStorage.getItem("aiui-azure-base-url") ?? ""; } catch { return ""; } })();
      const deploy   = (() => { try { return JSON.parse(localStorage.getItem("aiui-azure-endpoints") ?? "{}")[m.id] ?? ""; } catch { return ""; } })();
      const azure    = provider === "azure" && !!base && !!deploy && !!im.azureQualityOptions;
      const validQ   = azure ? im.azureQualityOptions! : (im.apiInput?.qualityOptions ?? []);
      if (validQ.length) {
        setQuality(prev => validQ.includes(prev) ? prev : validQ[0]);
      }
    }
    if (isVideo) {
      // We don't clear video refs here anymore to allow persistence when switching between video models
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId]);

  // Keep isAzureProvider in sync with localStorage whenever model or provider settings change
  useEffect(() => {
    const m = models.find(m => m.id === modelId);
    const im = m as { azureQualityOptions?: string[] } | undefined;
    const read = () => {
      try {
        const provider = getModelProvider(modelId);
        setProviderId(provider);
        const base     = localStorage.getItem("aiui-azure-base-url") ?? "";
        const deploy   = JSON.parse(localStorage.getItem("aiui-azure-endpoints") ?? "{}")[modelId] ?? "";
        const azure    = provider === "azure" && !!base && !!deploy && !!im?.azureQualityOptions;
        setIsAzureProvider(azure);
        if (!isVideo && im) {
          const validQ = azure ? (im.azureQualityOptions ?? []) : ((m as { apiInput?: { qualityOptions?: string[] } })?.apiInput?.qualityOptions ?? []);
          if (validQ.length) setQuality(prev => validQ.includes(prev) ? prev : validQ[0]);
        }
      } catch { setIsAzureProvider(false); }
    };
    read();
    window.addEventListener("storage", read);
    window.addEventListener("aiui-providers-changed", read);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener("aiui-providers-changed", read);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId, isVideo]);

  // Keep refs in sync so the observer callback can gate without needing to be recreated
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { loadingMoreRef.current = loadingMore; }, [loadingMore]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);

  // Infinite scroll — scroll events are reliable; postLoadCheckRef handles the case where
  // content doesn't fill the container after a page loads (no scroll event fires).
  useEffect(() => {
    const container = gridOuterRef.current;
    if (!container || !hasMore) return;

    const checkAndLoad = () => {
      if (!hasMoreRef.current || loadingRef.current || loadingMoreRef.current) return;
      if (container.scrollHeight - container.scrollTop - container.clientHeight < 800) {
        prevScrollHeightRef.current = container.scrollHeight;
        loadItems(tabRef.current, pageRef.current + 1);
      }
    };

    postLoadCheckRef.current = checkAndLoad;
    container.addEventListener("scroll", checkAndLoad, { passive: true });
    checkAndLoad();
    return () => {
      container.removeEventListener("scroll", checkAndLoad);
      postLoadCheckRef.current = () => {};
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loadItems, authLoaded]);

  // When sourceFilter changes, reset to page 0 and fetch only the relevant source.
  useEffect(() => {
    sourceFilterRef.current = sourceFilter;
    if (DEMO_MODE) return;
    pageRef.current = 0;
    setHasMore(true);
    const src = sourceFilter === "uploaded" ? "upload" : "generation";
    const cached = galleryCache.get(`${tabRef.current}-${src}`);
    if (cached) { setItems(cached.items); setHasMore(cached.hasMore); } else setItems([]);
    loadItems(tabRef.current, 0, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceFilter]);

  // Persist settings
  useEffect(() => {
    const refImageUrls = [...new Set(refImages
      .filter(r => r.cdnUrl && !r.uploading && !r.error)
      .map(r => r.cdnUrl!))];
    const readyCdnUrl = (r: RefImage) => !r.uploading && !r.error && !!r.cdnUrl;
    const s: SavedSettings = {
      prompt, modelId, aspectRatio, quality, count, duration, mode, sound, refImageUrls, azureResolution, azureCustomWidth, azureCustomHeight, promptTextMode, multiPromptMode,
      vidStartFrameUrl: vidStartFrame?.cdnUrl ?? null,
      vidEndFrameUrl: vidEndFrame?.cdnUrl ?? null,
      vidResourceUrls: vidResources.filter(readyCdnUrl).map(r => r.cdnUrl!),
      vidVideoRefUrl: vidVideoRef?.cdnUrl ?? null,
      vidRefVideoUrls: vidRefVideos.filter(readyCdnUrl).map(r => r.cdnUrl!),
      vidRefAudioUrls: vidRefAudios.filter(readyCdnUrl).map(r => r.cdnUrl!),
      vidElements,
      taggedImages,
    };
    settingsSnapshotRef.current = s;
    saveSettings(tab, prevFolderIdRef.current, s);
  }, [tab, prompt, modelId, aspectRatio, quality, count, duration, mode, sound, refImages, azureResolution, azureCustomWidth, azureCustomHeight, promptTextMode, multiPromptMode, vidStartFrame, vidEndFrame, vidResources, vidVideoRef, vidRefVideos, vidRefAudios, vidElements, taggedImages]);

  // Save/restore all settings when switching folders
  useEffect(() => {
    if (prevFolderIdRef.current === selectedFolderId) return;
    // Save current state to previous folder before switching
    if (settingsSnapshotRef.current) saveSettings(tab, prevFolderIdRef.current, settingsSnapshotRef.current);
    prevFolderIdRef.current = selectedFolderId;
    // Load settings for the new folder
    const saved = loadSettings(tab, selectedFolderId);
    const newModels = tab === "videos" ? VIDEO_MODELS : IMAGE_MODELS;
    const model = (saved?.modelId ? newModels.find(m => m.id === saved.modelId) : null) ?? newModels[0];
    const azureOpts = (model as { azureResolutionOptions?: string[] }).azureResolutionOptions;
    const savedIsCustom = saved?.aspectRatio === "custom" && Number.isFinite(saved.azureCustomWidth) && Number.isFinite(saved.azureCustomHeight) && isAzureActiveForModel(model.id, azureOpts);
    const savedAR = savedIsCustom ? "custom" : (saved?.aspectRatio && model.ratios.includes(saved.aspectRatio) ? saved.aspectRatio : null);
    const savedUrls = saved?.refImageUrls ?? [];
    const savedPrompt = saved?.prompt ?? "";
    const toRef = (url: string): RefImage => ({ id: url, objectUrl: url, cdnUrl: url, uploading: false, error: false });
    skipNextModelEffect.current = true;
    setPrompt(savedPrompt);
    setModelId(model.id);
    setAspectRatio(savedAR ?? ("defaultRatio" in model ? (model as { defaultRatio: string }).defaultRatio : null) ?? model.ratios[0] ?? "1:1");
    setAzureCustomWidth(saved?.azureCustomWidth);
    setAzureCustomHeight(saved?.azureCustomHeight);
    setQuality(saved?.quality ?? "2k");
    setCount(saved?.count ?? 1);
    if ("defaultDuration" in model) setDuration(saved?.duration ?? (model as { defaultDuration: number }).defaultDuration ?? 5);
    if ("defaultMode" in model) setMode(saved?.mode ?? (model as { defaultMode: string }).defaultMode ?? "");
    setSound(saved?.sound ?? false);
    setAzureResolution(saved?.azureResolution ?? "1k");
    setPromptTextMode(saved?.promptTextMode ?? "text");
    setMultiPromptMode(saved?.multiPromptMode ?? false);
    setRefImages(prev => { prev.forEach(r => URL.revokeObjectURL(r.objectUrl)); return savedUrls.map(toRef); });
    setTaggedImages(
      saved?.taggedImages?.length
        ? saved.taggedImages
        : savedUrls.flatMap((url, idx) => {
            const label = `image${idx + 1}`;
            return savedPrompt.includes(`@${label}`) ? [{ label, refId: url, url }] : [];
          })
    );
    setVidStartFrame(saved?.vidStartFrameUrl ? toRef(saved.vidStartFrameUrl) : null);
    setVidEndFrame(saved?.vidEndFrameUrl ? toRef(saved.vidEndFrameUrl) : null);
    setVidResources((saved?.vidResourceUrls ?? []).map(toRef));
    setVidVideoRef(saved?.vidVideoRefUrl ? toRef(saved.vidVideoRefUrl) : null);
    setVidRefVideos((saved?.vidRefVideoUrls ?? []).map(toRef));
    setVidRefAudios((saved?.vidRefAudioUrls ?? []).map(toRef));
    setVidElements(saved?.vidElements ?? []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFolderId]);

  // Track window width; set initial zoom from breakpoints only if NOT saved
  useEffect(() => {
    const w = window.innerWidth;
    setWindowWidth(w);
    if (!localStorage.getItem("aiui-gallery-zoom")) {
      setZoom(w >= 1400 ? 6 : w >= 900 ? 5 : w >= 640 ? 5 : 4);
    }
    const handler = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Save zoom to localStorage
  useEffect(() => {
    localStorage.setItem("aiui-gallery-zoom", zoom.toString());
  }, [zoom]);

  useEffect(() => {
    const el = gridOuterRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setContainerWidth(e.contentRect.width));
    ro.observe(el);
    setContainerWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  // Re-run once the full layout is mounted (after auth loads and user is present)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoaded, user]);

  // Cancel reorder drag if pointer released outside any item
  useEffect(() => {
    if (!draggingId) return;
    const cancel = () => {
      reorderDrag.item = null;
      reorderDrag.overId = null;
      setDraggingId(null);
      setReorderOverId(null);
    };
    document.addEventListener('pointerup', cancel);
    document.addEventListener('pointercancel', cancel);
    return () => {
      document.removeEventListener('pointerup', cancel);
      document.removeEventListener('pointercancel', cancel);
    };
  }, [draggingId]);

  // ── Image upload ──────────────────────────────────────────────────────────

  const imgModel = IMAGE_MODELS.find(m => m.id === modelId);
  const maxImgs = imgModel?.maxImages ?? 0;
  const canAddImgs = !isVideo && !!imgModel?.supportsImages && refImages.length < maxImgs;
  const promptMaxLength = (() => {
    if (isVideo) {
      const vm = VIDEO_MODELS.find(m => m.id === modelId);
      return vm?.apiInput.promptMaxLength ?? null;
    }
    if (!imgModel) return null;
    const hasRefImgs = refImages.length > 0;
    if (!hasRefImgs && imgModel.textOnlyPromptMaxLength) return imgModel.textOnlyPromptMaxLength;
    return imgModel.apiInput.promptMaxLength;
  })();
  const promptOverLimit = promptMaxLength !== null && prompt.length > promptMaxLength;

  const handleFilePick = async (files: FileList) => {
    if (!imgModel?.supportsImages) return;
    const remaining = maxImgs - refImages.length;
    const toAdd = Array.from(files).slice(0, remaining).filter(f => f.type.startsWith("image/"));
    if (toAdd.length === 0) return;

    const newEntries: RefImage[] = toAdd.map(f => ({
      id: randomUUID(),
      objectUrl: URL.createObjectURL(f),
      cdnUrl: null,
      uploading: true,
      error: false,
    }));
    setRefImages(prev => [...prev, ...newEntries]);

    const token = await getToken();
    await Promise.all(toAdd.map(async (file, i) => {
      const entry = newEntries[i];
      try {
        const res = await fetch("/api/upload-asset", {
          method: "POST",
          headers: {
            "Content-Type": file.type,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: file,
        });
        const data = await res.json() as { cdnUrl?: string; error?: string };
        if (!res.ok || !data.cdnUrl) throw new Error(data.error ?? "Upload failed");
        setRefImages(prev => prev.map(r => r.id === entry.id ? { ...r, cdnUrl: data.cdnUrl!, uploading: false } : r));
      } catch {
        setRefImages(prev => prev.map(r => r.id === entry.id ? { ...r, uploading: false, error: true } : r));
      }
    }));
  };

  const removeImage = (id: string) => {
    const el = document.querySelector(`[data-refimg-id="${id}"]`) as HTMLElement | null;
    if (el) {
      // Synchronous DOM write — zero frame delay, starts before React scheduler
      el.style.transition = "opacity 170ms cubic-bezier(0.4,0,1,1), transform 170ms cubic-bezier(0.4,0,1,1)";
      el.style.opacity = "0";
      el.style.transform = "translateY(-10px) scale(0.92)";
    }
    // React state as a backup so any re-render in the window doesn't reset the styles
    setRemovingIds(prev => new Set(prev).add(id));
    const removedImg = refImages.find(r => r.id === id);
    const { newTaggedImages, newPrompt } = removeTagAndRenumber(id, removedImg?.cdnUrl ?? null, taggedImages, prompt);
    setTimeout(() => {
      setRemovingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
      setRefImages(prev => {
        const img = prev.find(r => r.id === id);
        if (img) URL.revokeObjectURL(img.objectUrl);
        return prev.filter(r => r.id !== id);
      });
      setTaggedImages(newTaggedImages);
      setPrompt(newPrompt);
    }, 190);
  };

  // ── Video reference upload ────────────────────────────────────────────────

  const handleVidFilePick = async (
    files: FileList | null,
    target: "startFrame" | "endFrame" | "resource" | "videoRef" | "referenceVideo" | "audioRef",
  ) => {
    if (!files || files.length === 0) return;
    const vm = VIDEO_MODELS.find(m => m.id === modelId);
    const isSingle = target === "startFrame" || target === "endFrame" || target === "videoRef";

    const maxCount = isSingle ? 1 : (
      target === "resource"        ? (vm?.maxResources      ?? 3) :
      target === "referenceVideo"  ? (vm?.maxReferenceVideos ?? 3) :
                                     (vm?.maxReferenceAudios ?? 3)
    );
    const currentCount = isSingle ? 0 : (
      target === "resource"        ? vidResources.length :
      target === "referenceVideo"  ? vidRefVideos.length :
                                     vidRefAudios.length
    );
    const toAdd = Array.from(files).slice(0, maxCount - currentCount);
    if (toAdd.length === 0) return;

    const newEntries: RefImage[] = toAdd.map(f => ({
      id: randomUUID(),
      objectUrl: URL.createObjectURL(f),
      cdnUrl: null,
      uploading: true,
      error: false,
    }));

    const isSeedanceModel = modelId === "seedance-2" || modelId === "seedance-2-fast";
    if (isSingle) {
      const [entry] = newEntries;
      if (target === "startFrame") {
        setVidStartFrame(entry);
        if (modelId === "happyhorse") setVidResources([]);
        if (isSeedanceModel) { setVidResources([]); setVidRefVideos([]); setVidRefAudios([]); }
      } else if (target === "endFrame") {
        setVidEndFrame(entry);
        if (isSeedanceModel) { setVidResources([]); setVidRefVideos([]); setVidRefAudios([]); }
      } else setVidVideoRef(entry);
    } else {
      if (target === "resource") {
        if (modelId === "happyhorse") setVidStartFrame(null);
        if (isSeedanceModel) { setVidStartFrame(null); setVidEndFrame(null); }
        setVidResources(prev => [...prev, ...newEntries]);
      } else if (target === "referenceVideo") {
        if (isSeedanceModel) { setVidStartFrame(null); setVidEndFrame(null); }
        setVidRefVideos(prev => [...prev, ...newEntries]);
      } else {
        if (isSeedanceModel) { setVidStartFrame(null); setVidEndFrame(null); }
        setVidRefAudios(prev => [...prev, ...newEntries]);
      }
    }

    const token = await getToken();
    await Promise.all(toAdd.map(async (file, i) => {
      const entry = newEntries[i];
      try {
        const res = await fetch("/api/upload-asset", {
          method: "POST",
          headers: { "Content-Type": file.type, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: file,
        });
        const data = await res.json() as { cdnUrl?: string; error?: string };
        if (!res.ok || !data.cdnUrl) throw new Error(data.error ?? "Upload failed");
        const ok = (r: RefImage) => r.id === entry.id ? { ...r, cdnUrl: data.cdnUrl!, uploading: false } : r;
        if (isSingle) {
          if (target === "startFrame") setVidStartFrame(p => p?.id === entry.id ? { ...p, cdnUrl: data.cdnUrl!, uploading: false } : p);
          else if (target === "endFrame") setVidEndFrame(p => p?.id === entry.id ? { ...p, cdnUrl: data.cdnUrl!, uploading: false } : p);
          else setVidVideoRef(p => p?.id === entry.id ? { ...p, cdnUrl: data.cdnUrl!, uploading: false } : p);
        } else {
          if (target === "resource")       setVidResources(prev => prev.map(ok));
          else if (target === "referenceVideo") setVidRefVideos(prev => prev.map(ok));
          else                             setVidRefAudios(prev => prev.map(ok));
        }
      } catch {
        const err = (r: RefImage) => r.id === entry.id ? { ...r, uploading: false, error: true } : r;
        if (isSingle) {
          if (target === "startFrame") setVidStartFrame(p => p?.id === entry.id ? { ...p, uploading: false, error: true } : p);
          else if (target === "endFrame") setVidEndFrame(p => p?.id === entry.id ? { ...p, uploading: false, error: true } : p);
          else setVidVideoRef(p => p?.id === entry.id ? { ...p, uploading: false, error: true } : p);
        } else {
          if (target === "resource")       setVidResources(prev => prev.map(err));
          else if (target === "referenceVideo") setVidRefVideos(prev => prev.map(err));
          else                             setVidRefAudios(prev => prev.map(err));
        }
      }
    }));
  };

  const removeVidRef = (id: string, target: "startFrame" | "endFrame" | "resource" | "videoRef" | "referenceVideo" | "audioRef") => {
    let removedUrl: string | null = null;
    if (target === "startFrame") {
      removedUrl = vidStartFrame?.cdnUrl ?? null;
      setVidStartFrame(null);
    } else if (target === "endFrame") {
      removedUrl = vidEndFrame?.cdnUrl ?? null;
      setVidEndFrame(null);
    } else if (target === "videoRef") {
      removedUrl = vidVideoRef?.cdnUrl ?? null;
      setVidVideoRef(null);
    } else if (target === "resource") {
      removedUrl = vidResources.find(r => r.id === id)?.cdnUrl ?? null;
      setVidResources(prev => prev.filter(r => r.id !== id));
    } else if (target === "referenceVideo") {
      removedUrl = vidRefVideos.find(r => r.id === id)?.cdnUrl ?? null;
      setVidRefVideos(prev => prev.filter(r => r.id !== id));
    } else {
      removedUrl = vidRefAudios.find(r => r.id === id)?.cdnUrl ?? null;
      setVidRefAudios(prev => prev.filter(r => r.id !== id));
    }
    const { newTaggedImages, newPrompt } = removeTagAndRenumber(id, removedUrl, taggedImages, prompt);
    setTaggedImages(newTaggedImages);
    setPrompt(newPrompt);
  };

  // ── Media picker ──────────────────────────────────────────────────────────

  const openPicker = (target: NonNullable<typeof pickerTarget>, uploadKind: "image" | "video") => {
    pickerTargetRef.current = target;
    setPickerTarget(target);
    setPickerUploadKind(uploadKind);
    setPickerOpen(true);
  };

  const handlePickerSelect = (url: string) => {
    const target = pickerTargetRef.current;
    const isMulti = target === "refImage" || target === "resource" || target === "referenceVideo";
    if (!isMulti) setPickerOpen(false);
    if (!target) return;
    if (target === "refImage") {
      handleAddReference(url);
      return;
    }
    const isDup = (slots: RefImage[]) => slots.some(r => r.cdnUrl === url || r.objectUrl === url);

    const isSeedancePicker = modelId === "seedance-2" || modelId === "seedance-2-fast";
    if (target === "resource") {
      if (isDup(vidResources)) return;
      if (modelId === "happyhorse") setVidStartFrame(null);
      if (isSeedancePicker) { setVidStartFrame(null); setVidEndFrame(null); }
      setVidResources(prev => [...prev, { id: randomUUID(), objectUrl: url, cdnUrl: url, uploading: false, error: false }]);
      return;
    }
    if (target === "referenceVideo") {
      if (isDup(vidRefVideos)) return;
      if (isSeedancePicker) { setVidStartFrame(null); setVidEndFrame(null); }
      setVidRefVideos(prev => [...prev, { id: randomUUID(), objectUrl: url, cdnUrl: url, uploading: false, error: false }]);
      return;
    }
    const entry: RefImage = { id: randomUUID(), objectUrl: url, cdnUrl: url, uploading: false, error: false };
    if (target === "startFrame") {
      setVidStartFrame(entry);
      if (modelId === "happyhorse") setVidResources([]);
      if (isSeedancePicker) { setVidResources([]); setVidRefVideos([]); setVidRefAudios([]); }
    } else if (target === "endFrame") {
      setVidEndFrame(entry);
      if (isSeedancePicker) { setVidResources([]); setVidRefVideos([]); setVidRefAudios([]); }
    } else if (target === "videoRef") setVidVideoRef(entry);
  };

  const handlePickerDeselect = (url: string) => {
    const target = pickerTargetRef.current;
    if (target === "refImage") {
      const removedImg = refImages.find(r => r.cdnUrl === url || r.objectUrl === url);
      const { newTaggedImages, newPrompt } = removeTagAndRenumber(removedImg?.id ?? "", url, taggedImages, prompt);
      setRefImages(prev => prev.filter(r => r.cdnUrl !== url && r.objectUrl !== url));
      setTaggedImages(newTaggedImages);
      setPrompt(newPrompt);
    } else if (target === "resource") {
      const removedRef = vidResources.find(r => r.cdnUrl === url || r.objectUrl === url);
      const { newTaggedImages, newPrompt } = removeTagAndRenumber(removedRef?.id ?? "", url, taggedImages, prompt);
      setVidResources(prev => prev.filter(r => r.cdnUrl !== url && r.objectUrl !== url));
      setTaggedImages(newTaggedImages);
      setPrompt(newPrompt);
    } else if (target === "referenceVideo") {
      const removedRef = vidRefVideos.find(r => r.cdnUrl === url || r.objectUrl === url);
      const { newTaggedImages, newPrompt } = removeTagAndRenumber(removedRef?.id ?? "", url, taggedImages, prompt);
      setVidRefVideos(prev => prev.filter(r => r.cdnUrl !== url && r.objectUrl !== url));
      setTaggedImages(newTaggedImages);
      setPrompt(newPrompt);
    }
  };

  const handlePickerUpload = () => {
    setPickerOpen(false);
    if (DEMO_MODE) { useWorkflowStore.getState().setAuthModalOpen(true); return; }
    if (pickerTarget === "refImage") {
      fileInputRef.current?.click();
    } else if (pickerTarget) {
      vidPickTarget.current = pickerTarget as "startFrame" | "endFrame" | "resource" | "videoRef" | "referenceVideo";
      if (pickerUploadKind === "image") vidImgInputRef.current?.click();
      else vidVideoInputRef.current?.click();
    }
  };

  // ── Generate ──────────────────────────────────────────────────────────────

  const generateOne = async (token: string, promptOverride?: string): Promise<string> => {
    const effectivePrompt = promptOverride ?? prompt;
    if (!isVideo) {
      const { resolvedPrompt, extraUrls } = resolveGalleryMentions(effectivePrompt, taggedImages);
      const extraUrlSet = new Set(extraUrls);
      const refUrls = imgModel?.supportsImages ? refImages.filter(r => r.cdnUrl && !r.error && !extraUrlSet.has(r.cdnUrl!)).map(r => r.cdnUrl!) : [];
      const imageUrls = imgModel?.supportsImages ? [...new Set([...extraUrls, ...refUrls])] : [];

      // Read provider settings from localStorage (same keys as GenerateNode)
      const azureBaseUrl    = (() => { try { return localStorage.getItem("aiui-azure-base-url") ?? ""; } catch { return ""; } })();
      const azureDeployment = (() => { try { return JSON.parse(localStorage.getItem("aiui-azure-endpoints") ?? "{}")[modelId] ?? ""; } catch { return ""; } })();
      const providerForModel = (() => { try { return JSON.parse(localStorage.getItem("aiui-model-providers") ?? "{}")[modelId] ?? "kie"; } catch { return "kie"; } })();
      const isAzure = !!(azureBaseUrl && azureDeployment && providerForModel === "azure");
      const isCodex = providerForModel === "codex";

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          prompt: resolvedPrompt, model: modelId, aspectRatio, quality, imageUrls,
          ...(isAzure ? {
            azureBaseUrl, azureDeployment, azureQuality: quality, azureResolution,
            ...(aspectRatio === "custom" ? { azureCustomWidth, azureCustomHeight } : {}),
          } : {}),
          ...(isCodex ? { codexProvider: true } : {}),
        }),
      });
      const text = await res.text();
      let d: { taskId?: string; error?: string } = {};
      try { d = JSON.parse(text); } catch { throw new Error(res.ok ? "Invalid server response" : `Server error ${res.status}`); }
      if (!res.ok) throw new Error(d.error ?? `Server error ${res.status}`);
      return d.taskId!;
    } else {
      const vm = VIDEO_MODELS.find(m => m.id === modelId);
      const handles = vm?.handles ?? [];

      const { resolvedPrompt, extraAssets } = resolveGalleryMentions(effectivePrompt, taggedImages, vm?.resourceTagFormat ?? "default");

      const startFrameUrl = handles.includes("startFrame") && vidStartFrame?.cdnUrl ? vidStartFrame.cdnUrl : undefined;
      const endFrameUrl   = handles.includes("endFrame")   && vidEndFrame?.cdnUrl   ? vidEndFrame.cdnUrl   : undefined;
      const videoRefUrl   = handles.includes("videoRef")   && vidVideoRef?.cdnUrl   ? vidVideoRef.cdnUrl   : undefined;

      const useElements = !!(vm?.apiInput.useKlingElements);

      const taggedImageUrls = extraAssets.filter(a => a.kind === "image").map(a => a.url);
      const taggedVideoUrls = extraAssets.filter(a => a.kind === "video").map(a => a.url);
      const taggedAudioUrls = extraAssets.filter(a => a.kind === "audio").map(a => a.url);

      const extraImageSet = new Set(taggedImageUrls);
      const extraVideoSet = new Set(taggedVideoUrls);
      const extraAudioSet = new Set(taggedAudioUrls);

      // Non-kling resource models send referenceImageUrls
      const resourceUrls = handles.includes("resource") && !useElements
        ? vidResources.filter(r => r.cdnUrl && !r.error && !extraImageSet.has(r.cdnUrl!)).map(r => r.cdnUrl!)
        : [];
      const referenceImageUrls = !useElements && (taggedImageUrls.length > 0 || resourceUrls.length > 0)
        ? [...taggedImageUrls, ...resourceUrls]
        : undefined;

      // Kling: send structured elements
      const baseElements = useElements && handles.includes("resource") && vidElements.length > 0
        ? vidElements.map(el => ({ name: el.name, description: el.description, imageUrls: el.imageUrls }))
        : [];
      const mentionElements = useElements ? taggedImageUrls.map((url, i) => ({
        name: `element_${i + 1}`,
        description: `Mentioned image ${i + 1}`,
        imageUrls: [url],
      })) : [];
      const klingElements = useElements && (mentionElements.length > 0 || baseElements.length > 0)
        ? [...mentionElements, ...baseElements]
        : undefined;

      const baseVideoUrls = handles.includes("referenceVideo")
        ? vidRefVideos.filter(r => r.cdnUrl && !r.error && !extraVideoSet.has(r.cdnUrl!)).map(r => r.cdnUrl!)
        : [];
      const referenceVideoUrls = handles.includes("referenceVideo") && (taggedVideoUrls.length > 0 || baseVideoUrls.length > 0)
        ? [...taggedVideoUrls, ...baseVideoUrls]
        : undefined;

      const baseAudioUrls = handles.includes("audioRef")
        ? vidRefAudios.filter(r => r.cdnUrl && !r.error && !extraAudioSet.has(r.cdnUrl!)).map(r => r.cdnUrl!)
        : [];
      const referenceAudioUrls = handles.includes("audioRef") && (taggedAudioUrls.length > 0 || baseAudioUrls.length > 0)
        ? [...taggedAudioUrls, ...baseAudioUrls]
        : undefined;

      const isVeo = !!(vm?.apiInput.useGoogleVeo);
      const veoImageUrls: string[] = [];
      if (isVeo) {
        if (veoMode === "frames") {
          if (startFrameUrl) veoImageUrls.push(startFrameUrl);
          if (endFrameUrl)   veoImageUrls.push(endFrameUrl);
        } else if (veoMode === "references") {
          if (referenceImageUrls) veoImageUrls.push(...referenceImageUrls.slice(0, 3));
        }
      }

      const generationType = isVeo
        ? (veoMode === "references" ? "REFERENCE_2_VIDEO" : (veoImageUrls.length > 0 ? "FIRST_AND_LAST_FRAMES_2_VIDEO" : "TEXT_2_VIDEO"))
        : undefined;

      const res = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(isVeo ? {
          model: modelId,
          prompt: resolvedPrompt,
          aspect_ratio: aspectRatio,
          generationType,
          imageUrls: veoImageUrls,
          enableTranslation: true,
          enableFallback: false,
          watermark: "",
        } : {
          videoModel: modelId,
          prompt: resolvedPrompt,
          aspectRatio,
          duration,
          ...(vm?.sound ? { sound } : {}),
          ...(vm?.modes?.length ? { mode: mode || vm.defaultMode || "pro" } : {}),
          resolution: vm && "resolutions" in vm && vm.resolutions?.length ? resolution || vm.defaultResolution : undefined,
          ...(startFrameUrl               ? { startFrameUrl }               : {}),
          ...(endFrameUrl                 ? { endFrameUrl }                 : {}),
          ...(videoRefUrl                 ? { videoRefUrl }                 : {}),
          ...(klingElements?.length       ? { klingElements }               : {}),
          ...(referenceImageUrls?.length  ? { referenceImageUrls }          : {}),
          ...(referenceVideoUrls?.length  ? { referenceVideoUrls }          : {}),
          ...(referenceAudioUrls?.length  ? { referenceAudioUrls }          : {}),
          ...(vm?.supportsSeeds && seed ? { seed } : {}),
        }),
      });
      const text = await res.text();
      let d: { taskId?: string; error?: string } = {};
      try { d = JSON.parse(text); } catch { throw new Error(res.ok ? "Invalid server response" : `Server error ${res.status}`); }
      if (!res.ok) throw new Error(d.error ?? `Server error ${res.status}`);
      return d.taskId!;
    }
  };

  const pollTask = async (taskId: string): Promise<void> => {
    // Resolves after `ms` OR immediately when the tab becomes visible — whichever is first.
    // This ensures polling catches up instantly after the user returns to the tab,
    // even if the browser throttled the timer while it was hidden.
    const waitOrVisible = (ms: number) => new Promise<void>(resolve => {
      let done = false;
      const finish = () => { if (done) return; done = true; clearTimeout(t); document.removeEventListener("visibilitychange", onVisible); resolve(); };
      const onVisible = () => { if (!document.hidden) finish(); };
      const t = setTimeout(finish, ms);
      document.addEventListener("visibilitychange", onVisible);
    });

    for (let i = 0; i < 150; i++) {
      await waitOrVisible(3_000);
      const poll = await fetch(`/api/job-status?taskId=${taskId}`);
      const result = await poll.json() as { status: string; error?: string };
      if (result.status === "done") return;
      if (result.status === "error") throw new Error(result.error ?? "Generation failed");
    }
    throw new Error("Timed out");
  };

  const generate = async () => {
    if (kieKeySet === false) return;
    if (!prompt.trim() && !isVideo) return;
    requestNotificationPermission();
    if (refImages.some(r => r.uploading)) { setGenError("Images still uploading…"); setTimeout(() => setGenError(""), 3_000); return; }
    if (isVideo && [vidStartFrame, vidEndFrame, vidVideoRef, ...vidResources, ...vidRefVideos, ...vidRefAudios].some(r => r?.uploading)) {
      setGenError("References still uploading…"); setTimeout(() => setGenError(""), 3_000); return;
    }
    if (isVideo) {
      const vm = VIDEO_MODELS.find(m => m.id === modelId);
      if (vm?.requiredHandles?.length) {
        const handleHasContent = (h: string) => {
          if (h === "resource")        return vidResources.some(r => r.cdnUrl && !r.error);
          if (h === "startFrame")      return !!(vidStartFrame?.cdnUrl && !vidStartFrame.error);
          if (h === "endFrame")        return !!(vidEndFrame?.cdnUrl && !vidEndFrame.error);
          if (h === "videoRef")        return !!(vidVideoRef?.cdnUrl && !vidVideoRef.error);
          if (h === "referenceVideo")  return vidRefVideos.some(r => r.cdnUrl && !r.error);
          if (h === "audioRef")        return vidRefAudios.some(r => r.cdnUrl && !r.error);
          if (h === "prompt")          return !!prompt.trim();
          return true;
        };
        const HANDLE_LABELS: Record<string, string> = {
          resource: "Reference image",
          startFrame: "Start frame image",
          endFrame: "End frame image",
          videoRef: "Reference video",
          referenceVideo: "Reference video",
          audioRef: "Reference audio",
          prompt: "Text prompt",
        };
        const missing = vm.requiredHandles.filter(h => !handleHasContent(h));
        if (missing.length > 0) {
          const labels = missing.map(h => HANDLE_LABELS[h] ?? h).join(", ");
          addToast(`Missing required input${missing.length > 1 ? "s" : ""}: ${labels}.`, "error");
          return;
        }
      }
    }
    if (!user && process.env.NEXT_PUBLIC_GUEST_MODE !== "true") {
      setAuthModalOpen(true);
      return;
    }
    setGenError("");

    const multiPrompts = multiPromptMode ? prompt.split(/\n\n+/).map(p => p.trim()).filter(Boolean) : null;
    const n = multiPrompts ? multiPrompts.length : (isVideo ? 1 : count);
    const snapshotRefUrls = isVideo
      ? [
          ...(vidStartFrame?.cdnUrl && !vidStartFrame.error ? [vidStartFrame.cdnUrl] : []),
          ...(vidEndFrame?.cdnUrl   && !vidEndFrame.error   ? [vidEndFrame.cdnUrl]   : []),
          ...vidResources.filter(r => r.cdnUrl && !r.error).map(r => r.cdnUrl!),
        ]
      : [...new Set(refImages.filter(r => r.cdnUrl && !r.error).map(r => r.cdnUrl!))];
    const snapshotFolderId = selectedFolderId;
    const newPendings: PendingGen[] = Array.from({ length: n }, (_, i) => ({
      id: randomUUID(), aspectRatio, prompt: multiPrompts ? multiPrompts[i] : prompt, referenceImageUrls: snapshotRefUrls, createdAt: new Date().toISOString(), tab, prePending: true, folderId: snapshotFolderId,
    }));
    setPendingGens(prev => [...newPendings, ...prev]);

    // ── Debug mode: log + simulate, no real API call ────────────────────────
    if (debugMode) {
      const dbgVm = isVideo ? VIDEO_MODELS.find(m => m.id === modelId) : undefined;
      const { resolvedPrompt: dbgPrompt, extraUrls: dbgExtra, extraAssets: dbgAssets } = resolveGalleryMentions(prompt, taggedImages, dbgVm?.resourceTagFormat ?? "default");
      const dbgExtraSet = new Set(dbgExtra);
      const dbgRefUrls = refImages.filter(r => r.cdnUrl && !r.error && !dbgExtraSet.has(r.cdnUrl!)).map(r => r.cdnUrl!);
      const dbgAzureBaseUrl    = (() => { try { return localStorage.getItem("aiui-azure-base-url") ?? ""; } catch { return ""; } })();
      const dbgAzureDeployment = (() => { try { return JSON.parse(localStorage.getItem("aiui-azure-endpoints") ?? "{}")[modelId] ?? ""; } catch { return ""; } })();
      const dbgProvider        = (() => { try { return JSON.parse(localStorage.getItem("aiui-model-providers") ?? "{}")[modelId] ?? "kie"; } catch { return "kie"; } })();
      const dbgIsAzure = !!(dbgAzureBaseUrl && dbgAzureDeployment && dbgProvider === "azure");
      const dbgTaggedImageUrls = dbgAssets.filter(a => a.kind === "image").map(a => a.url);
      const dbgTaggedVideoUrls = dbgAssets.filter(a => a.kind === "video").map(a => a.url);
      const dbgTaggedAudioUrls = dbgAssets.filter(a => a.kind === "audio").map(a => a.url);
      const dbgExtraImageSet = new Set(dbgTaggedImageUrls);
      const dbgExtraVideoSet = new Set(dbgTaggedVideoUrls);
      const dbgExtraAudioSet = new Set(dbgTaggedAudioUrls);
      console.log("[Gallery Debug] Generate request:", {
        type: isVideo ? "video" : "image",
        prompt: dbgPrompt, model: modelId, aspectRatio, quality,
        provider: dbgIsAzure ? "azure" : "kie",
        ...(dbgIsAzure ? {
          azureBaseUrl: dbgAzureBaseUrl, azureDeployment: dbgAzureDeployment, azureQuality: quality, azureResolution,
          ...(aspectRatio === "custom" ? { azureCustomWidth, azureCustomHeight } : {}),
        } : {}),
        ...(isVideo ? {
          duration, mode,
          startFrameUrl:       vidStartFrame?.cdnUrl ?? null,
          endFrameUrl:         vidEndFrame?.cdnUrl   ?? null,
          taggedImageUrls:     dbgTaggedImageUrls,
          taggedVideoUrls:     dbgTaggedVideoUrls,
          taggedAudioUrls:     dbgTaggedAudioUrls,
          resourceUrls:        vidResources.filter(r => r.cdnUrl && !r.error && !dbgExtraImageSet.has(r.cdnUrl!)).map(r => r.cdnUrl!),
          referenceVideoUrls:  vidRefVideos.filter(r => r.cdnUrl && !r.error && !dbgExtraVideoSet.has(r.cdnUrl!)).map(r => r.cdnUrl!),
          referenceAudioUrls:  vidRefAudios.filter(r => r.cdnUrl && !r.error && !dbgExtraAudioSet.has(r.cdnUrl!)).map(r => r.cdnUrl!),
        } : { imageUrls: [...new Set([...dbgExtra, ...dbgRefUrls])], count: n }),
      });
      setTimeout(() => {
        setPendingGens(prev => prev.filter(p => !newPendings.some(np => np.id === p.id)));
      }, 3_000);
      return;
    }

    // ── 3-second pre-pending window before actual API call ────────────────
    const batchKey = newPendings[0].id;
    const submitBatch = async () => {
      prePendingTimersRef.current.delete(batchKey);
      // Only process entries that weren't cancelled during the pre-pending window
      const active = newPendings.filter(p => pendingGensRef.current.some(pg => pg.id === p.id && pg.prePending));
      if (active.length === 0) return;

      const activeIds = new Set(active.map(p => p.id));
      setPendingGens(prev => prev.map(p => activeIds.has(p.id) ? { ...p, prePending: false } : p));

      const token = await getToken();
      if (!token) {
        setPendingGens(prev => prev.map(p =>
          activeIds.has(p.id) ? { ...p, error: "Please sign in to generate." } : p
        ));
        return;
      }

      setSubmitting(true);
      const promptByPendingId = new Map(newPendings.map((p, i) => [p.id, multiPrompts ? multiPrompts[i] : undefined]));
      let taskIds: string[];
      try {
        taskIds = await Promise.all(active.map(p => generateOne(token, promptByPendingId.get(p.id))));
      } catch (e: unknown) {
        setSubmitting(false);
        const msg = e instanceof Error ? e.message : String(e);
        setPendingGens(prev => prev.map(p =>
          activeIds.has(p.id) ? { ...p, error: msg } : p
        ));
        return;
      }
      setSubmitting(false);

      // Store taskIds so polls can be resumed after a page refresh
      setPendingGens(prev => prev.map(p => {
        const idx = active.findIndex(np => np.id === p.id);
        return idx >= 0 ? { ...p, taskId: taskIds[idx] } : p;
      }));

      // ── Poll each task independently ──────────────────────────────────────
      taskIds.forEach(async (taskId, i) => {
        const pending = active[i];
        try {
          await pollTask(taskId);
          // Fetch fresh items before touching state so both updates land in one render.
          const existingIds = new Set((galleryCache.get(`${tabRef.current}-generation`)?.items ?? []).map((i: GalleryItem) => i.id));
          const fresh = await fetchNewItems(tabRef.current);
          setPendingGens(prev => prev.filter(p => p.id !== pending.id));
          if (fresh.length > 0) {
            if (pending.folderId) {
              const existingMap = useFolderStore.getState().itemFolderMap;
              const pendingTime = pending.createdAt ? new Date(pending.createdAt).getTime() - 30_000 : 0;
              const untaggedIds = fresh
                .filter(i => new Date(i.created_at).getTime() >= pendingTime)
                .map(i => i.id)
                .filter(id => !existingMap[id]);
              if (untaggedIds.length > 0) assignItemsToFolder(untaggedIds, pending.folderId);
            }
            const genCacheKey = `${tabRef.current}-generation`;
            setItems(prev => {
              const base = sourceFilterRef.current === "generated" ? prev : (galleryCache.get(genCacheKey)?.items ?? []);
              const merged = mergeByNewest(base, fresh);
              galleryCache.set(genCacheKey, { items: merged, hasMore: true });
              return sourceFilterRef.current === "generated" ? (merged === base ? prev : merged) : prev;
            });
          }
          onGenComplete(pending.folderId, fresh.filter(i => !existingIds.has(i.id)).map(i => i.id));
          window.dispatchEvent(new Event("credits-refresh"));
          browserNotify(
            isVideo ? "Video ready" : "Image ready",
            (pending.prompt || "Your generation is ready").slice(0, 100),
          );
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          setPendingGens(prev => prev.map(p => p.id === pending.id ? { ...p, error: msg } : p));
          browserNotify("Generation failed", msg.slice(0, 100));
        }
      });
    };

    const batchTimer = setTimeout(submitBatch, 3000);
    prePendingTimersRef.current.set(batchKey, batchTimer);
  };

  // ── @ mention derived + helpers ───────────────────────────────────────────

  const mentionableAssets = useMemo(() => {
    if (!isVideo) {
      return refImages
        .filter(r => !r.uploading && !r.error && r.cdnUrl)
        .map((r, i) => ({ ...r, kind: "image" as const, label: `image${i + 1}`, role: `Reference ${i + 1}` }));
    } else {
      const isVeo = modelId === "veo3" || modelId === "veo3_fast" || modelId === "veo3_lite";
      const assets: (RefImage & { kind: "image" | "video" | "audio"; label: string; role: string })[] = [];
      
      // Images
      const imgs: { ref: RefImage; role: string }[] = [];
      const startOk = vidStartFrame?.cdnUrl && !vidStartFrame.uploading && !vidStartFrame.error;
      const endOk = vidEndFrame?.cdnUrl && !vidEndFrame.uploading && !vidEndFrame.error;
      const resOk = vidResources.filter(r => r.cdnUrl && !r.uploading && !r.error);

      if (isVeo) {
        if (veoMode === "frames") {
          if (startOk) imgs.push({ ref: vidStartFrame!, role: "Start Frame" });
          if (endOk) imgs.push({ ref: vidEndFrame!, role: "End Frame" });
        } else if (veoMode === "references") {
          resOk.forEach((r, i) => imgs.push({ ref: r, role: `Reference ${i + 1}` }));
        }
      } else {
        if (startOk) imgs.push({ ref: vidStartFrame!, role: "Start Frame" });
        if (endOk) imgs.push({ ref: vidEndFrame!, role: "End Frame" });
        resOk.forEach((r, i) => imgs.push({ ref: r, role: `Reference ${i + 1}` }));
      }
      assets.push(...imgs.map((item, i) => ({ ...item.ref, kind: "image" as const, label: `image${i + 1}`, role: item.role })));

      // Videos (hide for Veo)
      if (!isVeo) {
        const vids: { ref: RefImage; role: string }[] = [];
        if (vidVideoRef?.cdnUrl && !vidVideoRef.uploading && !vidVideoRef.error) vids.push({ ref: vidVideoRef, role: "Reference Video" });
        vidRefVideos.filter(r => r.cdnUrl && !r.uploading && !r.error).forEach((r, i) => vids.push({ ref: r, role: `Video ${i + 1}` }));
        assets.push(...vids.map((item, i) => ({ ...item.ref, kind: "video" as const, label: `vid${i + 1}`, role: item.role })));
      }

      // Audios (hide for Veo)
      if (!isVeo) {
        const auds = vidRefAudios.filter(r => r.cdnUrl && !r.uploading && !r.error);
        assets.push(...auds.map((r, i) => ({ ...r, kind: "audio" as const, label: `aud${i + 1}`, role: `Audio ${i + 1}` })));
      }

      return assets;
    }
  }, [isVideo, modelId, veoMode, refImages, vidStartFrame, vidEndFrame, vidVideoRef, vidResources, vidRefVideos, vidRefAudios]);

  const filteredMentions = useMemo(() => {
    if (mentionQuery === null) return [];
    return mentionableAssets.slice(0, 8);
  }, [mentionableAssets, mentionQuery]);

  const atMenuOpen = mentionQuery !== null && filteredMentions.length > 0;

  useEffect(() => { setMentionSelIdx(0); }, [filteredMentions.length]);

  // Stable content key so the effect only re-runs when assets actually change, not just reference
  const mentionableAssetsKey = mentionableAssets.map(a => `${a.id}:${a.label}:${a.cdnUrl ?? ""}`).join("|");

  // Sync: remove stale chips; auto-tag @mentions that match attached assets (paste support)
  useEffect(() => {
    setTaggedImages(prev => {
      const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const filtered = prev.filter(t => new RegExp(`@${esc(t.label)}(?!\\w)`).test(prompt));
      const newTags: TaggedImage[] = [];
      for (const asset of mentionableAssets) {
        if (!filtered.some(t => t.label === asset.label) && asset.cdnUrl) {
          if (new RegExp(`@${esc(asset.label)}(?!\\w)`).test(prompt)) {
            newTags.push({ label: asset.label, refId: asset.id, url: asset.cdnUrl, kind: asset.kind });
          }
        }
      }
      const next = newTags.length === 0 ? filtered : [...filtered, ...newTags];
      if (next.length === prev.length && next.every((t, i) => t.refId === prev[i].refId && t.label === prev[i].label)) return prev;
      return next;
    });
    if (inputRef.current && !multiPromptMode) {
      const maxH = promptExpanded ? window.innerHeight * 0.75 - 220 : 264;
      resizeTextarea(inputRef.current, maxH);
    }
    if (overlayInnerRef.current) {
      const st = inputRef.current?.scrollTop ?? 0;
      overlayInnerRef.current.style.transform = st > 0 ? `translateY(-${st}px)` : "";
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, mentionableAssetsKey]);

  const openDurPicker = useCallback(() => {
    const r = durPillRef.current?.getBoundingClientRect();
    if (!r) return;
    setDurPickerPos({ left: r.left, bottom: window.innerHeight - r.top + 6 });
    setDurPickerOpen(true);
  }, []);

  const closeDurPicker = useCallback(() => {
    if (durCloseTimer.current) clearTimeout(durCloseTimer.current);
    setDurPickerOpen(false);
    setDurPickerClosing(true);
    durCloseTimer.current = setTimeout(() => setDurPickerClosing(false), 180);
  }, []);

  // Close duration picker on outside click
  useEffect(() => {
    if (!durPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (!durPillRef.current?.contains(e.target as Node)) closeDurPicker();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [durPickerOpen, closeDurPicker]);

  // Close @ menu on outside click
  useEffect(() => {
    if (!atMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-at-menu]") &&
        !(e.target as HTMLElement).closest("[data-prompt-input]")) {
        setMentionQuery(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [atMenuOpen]);

  // Close element picker on outside click — does NOT collapse the prompt
  useEffect(() => {
    if (!elementPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-element-picker-modal]")) {
        setElementPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [elementPickerOpen]);

  // Collapse expanded prompt on outside click — passes through to gallery
  useEffect(() => {
    if (!promptExpanded) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-prompt-overlay]")) return;
      if (target.closest("[data-element-picker-modal]")) return;
      if (target.closest("[data-at-menu]")) return;
      if (target.closest("[data-custom-dropdown-portal]")) return;
      if (promptBarRef.current && !promptBarRef.current.contains(target)) {
        setPromptExpanded(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [promptExpanded]);

  const insertMention = (ref: RefImage & { kind?: "image" | "video" | "audio"; label?: string }) => {
    const label = ref.label || "image1";
    if (!taggedImages.some(t => t.refId === ref.id))
      setTaggedImages(prev => [...prev, { label, refId: ref.id, url: ref.cdnUrl!, kind: isVideo ? (ref.kind || "image") : "image" }]);

    if (multiPromptMode && activeBlockIdxRef.current !== null) {
      const blocks = prompt.split(/\n\n+/).reduce<string[]>((acc, b) => {
        if (!b.trim() && acc.some(x => !x.trim())) return acc;
        return [...acc, b];
      }, []);
      const idx = activeBlockIdxRef.current;
      if (idx < blocks.length) {
        const blockInput = activeBlockRef.current;
        const blockText = blocks[idx];
        const cursor = blockInput?.selectionStart ?? blockText.length;
        const before = blockText.slice(0, cursor);
        const after = blockText.slice(cursor);
        const lastAt = before.lastIndexOf("@");
        const newBlockText = lastAt >= 0
          ? `${before.slice(0, lastAt)}@${label} ${after}`
          : `${before}@${label} ${after}`;
        const newPos = (lastAt >= 0 ? lastAt : cursor) + label.length + 2;
        const updatedBlocks = [...blocks];
        updatedBlocks[idx] = newBlockText;
        setPrompt(updatedBlocks.join('\n\n'));
        setMentionQuery(null);
        requestAnimationFrame(() => {
          if (!blockInput) return;
          blockInput.focus();
          blockInput.setSelectionRange(newPos, newPos);
        });
      }
      return;
    }

    const input = inputRef.current;
    const cursor = input?.selectionStart ?? prompt.length;
    const before = prompt.slice(0, cursor);
    const after = prompt.slice(cursor);
    const lastAt = before.lastIndexOf("@");
    const newText = lastAt >= 0
      ? `${before.slice(0, lastAt)}@${label} ${after}`
      : `${before}@${label} ${after}`;
    const newPos = (lastAt >= 0 ? lastAt : cursor) + label.length + 2;

    setPrompt(newText);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      if (!input) return;
      input.focus();
      input.setSelectionRange(newPos, newPos);
    });
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const vidModel = VIDEO_MODELS.find(m => m.id === modelId);
  const ratios = (isVideo ? vidModel?.ratios : imgModel?.ratios) ?? [];
  const supportsQ = !isVideo && !!imgModel?.supportsQuality;

  const qualityOpts: string[] = isAzureProvider
    ? (imgModel!.azureQualityOptions ?? [])
    : (imgModel?.apiInput.qualityOptions ?? ["2k", "4k"]);
  const azureResolutionOpts: string[] = isAzureProvider ? (imgModel?.azureResolutionOptions ?? []) : [];
  const durations = vidModel?.durations ?? [];
  const vidModes = vidModel?.modes ?? [];
  const activeModel = models.find(m => m.id === modelId);
  const hasRefImgs = refImages.length > 0;
  const allUploaded = refImages.every(r => !r.uploading);
  const vidRefHandles = (vidModel?.handles ?? []).filter(h => h !== "prompt");
  const hasVidRefs = isVideo && (!!vidStartFrame || !!vidEndFrame || !!vidVideoRef || vidResources.length > 0 || vidElements.length > 0 || vidRefVideos.length > 0 || vidRefAudios.length > 0);

  const displayRefImages    = getDisplayOrder(refImages,    draggingId, reorderOverId);
  const displayVidResources = getDisplayOrder(vidResources, draggingId, reorderOverId);
  const displayVidRefVideos = getDisplayOrder(vidRefVideos, draggingId, reorderOverId);
  const displayVidRefAudios = getDisplayOrder(vidRefAudios, draggingId, reorderOverId);

  const vidRequiresPrompt = isVideo && !!(vidModel?.apiInput.promptMaxLength);
  const canGenerate = kieKeySet === false ? false : submitting ? false : promptOverLimit ? false : (vidRequiresPrompt || !isVideo) ? prompt.trim().length > 0 : true;

  const handleAddReference = useCallback((url: string) => {
    if (refImages.some(r => r.cdnUrl === url || r.objectUrl === url)) {
      setRefError("Already added as a reference.");
      setTimeout(() => setRefError(""), 3000);
      return;
    }
    if (refImages.length >= maxImgs) return;
    setRefImages(prev => [...prev, { id: randomUUID(), objectUrl: url, cdnUrl: url, uploading: false, error: false }]);
  }, [refImages, maxImgs]);

  const handleGalleryItemDrop = useCallback((
    e: React.DragEvent,
    target: "refImage" | "startFrame" | "endFrame" | "resource" | "videoRef" | "referenceVideo",
    expectedKind: "image" | "video",
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverSlotKey(null);
    const dragged = galleryDrag.item;
    galleryDrag.item = null;
    if (!dragged) return;
    const { url, mediaType } = dragged;
    if (mediaType !== expectedKind) return;
    const entry: RefImage = { id: randomUUID(), objectUrl: url, cdnUrl: url, uploading: false, error: false };
    if (target === "refImage") {
      handleAddReference(url);
    } else if (target === "startFrame") {
      setVidStartFrame(entry);
      if (modelId === "happyhorse") setVidResources([]);
      if (modelId === "seedance-2" || modelId === "seedance-2-fast") { setVidResources([]); setVidRefVideos([]); setVidRefAudios([]); }
    } else if (target === "endFrame") {
      setVidEndFrame(entry);
      if (modelId === "seedance-2" || modelId === "seedance-2-fast") { setVidResources([]); setVidRefVideos([]); setVidRefAudios([]); }
    } else if (target === "videoRef") {
      setVidVideoRef(entry);
    } else if (target === "resource") {
      if (modelId === "seedance-2" || modelId === "seedance-2-fast") { setVidStartFrame(null); setVidEndFrame(null); }
      setVidResources(prev => [...prev, entry]);
    } else if (target === "referenceVideo") {
      if (modelId === "seedance-2" || modelId === "seedance-2-fast") { setVidStartFrame(null); setVidEndFrame(null); }
      setVidRefVideos(prev => [...prev, entry]);
    }
  }, [handleAddReference, modelId]);

  const handleReorderDrop = (targetId: string, listTarget: "refImage" | "resource" | "referenceVideo" | "audioRef") => {
    const dragId = reorderDrag.item?.id;
    reorderDrag.item = null;
    reorderDrag.overId = null;
    setReorderOverId(null);
    setDraggingId(null);
    if (!dragId || dragId === targetId) return;
    reorderDrag.justDropped = true;
    setTimeout(() => { reorderDrag.justDropped = false; }, 300);

    let oldArr: RefImage[];
    let setter: (fn: (prev: RefImage[]) => RefImage[]) => void;
    if (listTarget === "refImage")         { oldArr = refImages;    setter = setRefImages; }
    else if (listTarget === "resource")    { oldArr = vidResources; setter = setVidResources; }
    else if (listTarget === "referenceVideo") { oldArr = vidRefVideos; setter = setVidRefVideos; }
    else                                   { oldArr = vidRefAudios; setter = setVidRefAudios; }

    const dragIdx = oldArr.findIndex(r => r.id === dragId);
    const targetIdx = oldArr.findIndex(r => r.id === targetId);
    if (dragIdx === -1 || targetIdx === -1) return;

    const newArr = [...oldArr];
    const [moved] = newArr.splice(dragIdx, 1);
    newArr.splice(targetIdx, 0, moved);
    setter(() => newArr);

    const { newTaggedImages, newPrompt } = reorderAndRenumberTags(oldArr, newArr, "image", taggedImages, prompt);
    setTaggedImages(newTaggedImages);
    setPrompt(newPrompt);
  };

  const handleCopyPrompt = useCallback((text: string, refUrls?: string[], meta?: { model?: string; aspectRatio?: string; quality?: string; azureResolution?: string }) => {
    const newRefs = (refUrls ?? []).map(url => ({
      id: randomUUID(), objectUrl: url, cdnUrl: url, uploading: false, error: false,
    }));

    let processedText = text;
    const tagged: TaggedImage[] = [];

    if (refUrls?.length) {
      // Attempt to un-resolve mentions: <<<image N>>> or @imageN -> @imageN
      processedText = text.replace(/<<<image (\d+)>>>|@image(\d+)/gi, (m, g1, g2) => {
        const n = parseInt(g1 || g2);
        const url = refUrls[n - 1];
        if (url) {
          const label = `image${n}`;
          if (!tagged.some(t => t.label === label)) {
            tagged.push({ label, refId: url, url });
          }
          return `@${label}`;
        }
        return m;
      });
    }

    if (tab === "videos") {
      // Use the source model's handles (meta.model), not the currently-selected model.
      // setModelId runs after this block so modelId is stale here.
      const targetModelId = meta?.model ?? modelId;
      const vm = VIDEO_MODELS.find(m => m.id === targetModelId) ?? VIDEO_MODELS.find(m => m.id === modelId);
      const handles = vm?.handles ?? [];
      const useElements = !!(vm?.apiInput.useKlingElements);

      // Clear existing video refs
      setVidStartFrame(null);
      setVidEndFrame(null);
      setVidResources([]);
      setVidVideoRef(null);
      setVidRefVideos([]);
      setVidRefAudios([]);
      setVidElements([]);

      const remaining = [...newRefs];
      if (handles.includes("startFrame") && remaining.length > 0) {
        setVidStartFrame(remaining.shift()!);
      }
      if (handles.includes("endFrame") && remaining.length > 0) {
        setVidEndFrame(remaining.shift()!);
      }
      if (handles.includes("videoRef") && remaining.length > 0) {
        setVidVideoRef(remaining.shift()!);
      }
      if (handles.includes("resource") && remaining.length > 0) {
        if (useElements) {
          // Kling-style: resource slot renders vidElements, not vidResources
          setVidElements(remaining.map(r => ({
            id: r.id,
            name: "image",
            description: "",
            imageUrls: [r.cdnUrl!, r.cdnUrl!],
          })));
        } else {
          setVidResources(remaining);
        }
      }
    } else {
      setRefImages(prev => {
        prev.forEach(r => URL.revokeObjectURL(r.objectUrl));
        return newRefs;
      });
    }

    setTaggedImages(tagged);
    setPrompt(processedText);
    if (meta?.model) {
      const knownModels = tab === "videos" ? VIDEO_MODELS : IMAGE_MODELS;
      if (knownModels.some(m => m.id === meta.model)) setModelId(meta.model);
    }
    if (meta?.aspectRatio) setAspectRatio(meta.aspectRatio);
    if (meta?.quality) setQuality(meta.quality);
    if (meta?.azureResolution) setAzureResolution(meta.azureResolution);
    requestAnimationFrame(() => {
      if (inputRef.current) resizeTextarea(inputRef.current);
    });
  }, [tab, modelId]);

  const clearDeletedFromNodes = useCallback((deletedUrls: Set<string>) => {
    const { nodes, updateNodeData } = useWorkflowStore.getState();
    for (const node of nodes) {
      const gens = ((node.data.generations as (string | null | { error: string })[]) ?? []);
      const filtered = gens.filter(g => !(typeof g === "string" && deletedUrls.has(g)));
      if (filtered.length === gens.length) continue;
      const newIdx = Math.max(0, Math.min((node.data.currentGenIdx as number | undefined) ?? 0, filtered.length - 1));
      const last = filtered[newIdx];
      const lastUrl = filtered.length > 0 && typeof last === "string" ? last : undefined;
      const isVideo = node.type === "videoGeneratorNode";
      updateNodeData(node.id, {
        generations: filtered,
        currentGenIdx: filtered.length > 0 ? newIdx : 0,
        ...(isVideo ? { videoUrl: lastUrl } : { imageUrl: lastUrl }),
        status: filtered.length > 0 ? "done" : "idle",
      });
    }
  }, []);

  const handleDelete = useCallback(async (id: string, source: "generation" | "upload") => {
    const token = await getToken();
    if (!token) return;
    const item = items.find(i => i.id === id);
    await fetch("/api/gallery", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, source }),
    });
    if (item) clearDeletedFromNodes(new Set([item.url, ...(item.imageUrls ?? [])]));
    setItems(prev => {
      const updated = prev.filter(i => i.id !== id);
      const src = sourceFilterRef.current === "uploaded" ? "upload" : "generation";
      galleryCache.set(`${tabRef.current}-${src}`, { items: updated, hasMore });
      return updated;
    });
  }, [hasMore, items, clearDeletedFromNodes]);

  const handleDownload = useCallback(async (url: string, itemIsVideo: boolean): Promise<void> => {
    const urlExt = url.split("?")[0].split(".").pop()?.toLowerCase();
    const ext = itemIsVideo ? "mp4" : (urlExt && ["png","jpg","jpeg","webp","gif"].includes(urlExt) ? urlExt : "png");
    const filename = `${Date.now()}.${ext}`;
    const taskId = randomUUID();
    setDownloads(prev => [...prev, { id: taskId, filename, status: "preparing" }]);
    try {
      const res = await fetch(`/api/download?url=${encodeURIComponent(url)}&filename=${filename}`);
      if (!res.ok) throw new Error("Failed");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
      setDownloads(prev => prev.map(t => t.id === taskId ? { ...t, status: "ready" } : t));
    } catch {
      setDownloads(prev => prev.map(t => t.id === taskId ? { ...t, status: "error" } : t));
    }
  }, []);

  // Auto-dismiss download toast when all tasks complete
  useEffect(() => {
    if (downloads.length > 0 && downloads.every(d => d.status !== "preparing")) {
      const timer = setTimeout(() => setDownloads([]), 4000);
      return () => clearTimeout(timer);
    }
  }, [downloads]);

  const handleDownloadSelected = useCallback(async () => {
    const toDownload = items.filter(i => selectedIds.has(i.id));
    clearSelection();
    for (const item of toDownload) {
      await handleDownload(item.url, item.mediaType === "video");
    }
  }, [items, selectedIds, handleDownload]);

  const handleDeleteSelected = useCallback(async () => {
    const toDelete = items.filter(i => selectedIds.has(i.id));
    clearSelection();
    const token = await getToken();
    if (!token) return;
    await Promise.all(toDelete.map(item =>
      fetch("/api/gallery", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: item.id, source: item.source }),
      })
    ));
    const deletedUrls = new Set(toDelete.flatMap(i => [i.url, ...(i.imageUrls ?? [])]));
    clearDeletedFromNodes(deletedUrls);
    setItems(prev => {
      const ids = new Set(toDelete.map(i => i.id));
      const updated = prev.filter(i => !ids.has(i.id));
      const src = sourceFilterRef.current === "uploaded" ? "upload" : "generation";
      galleryCache.set(`${tabRef.current}-${src}`, { items: updated, hasMore });
      return updated;
    });
  }, [items, selectedIds, hasMore, clearDeletedFromNodes]);

  const GALLERY_GAP = 1;

  // All folder IDs in the selected folder's subtree (selected + all descendants).
  const selectedFolderIds = useMemo<Set<string> | null>(() => {
    if (!selectedFolderId) return null;
    const ids = new Set<string>();
    const queue = [selectedFolderId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      ids.add(id);
      for (const f of folders) {
        if (f.parentId === id) queue.push(f.id);
      }
    }
    return ids;
  }, [selectedFolderId, folders]);

  const filteredItems = useMemo(() => {
    const bySource = sourceFilter === "generated"
      ? items.filter(item => item.source === "generation")
      : items.filter(item => item.source === "upload");
    if (!selectedFolderIds) return bySource;
    return bySource.filter(item => itemFolderMap[item.id]?.some(fid => selectedFolderIds.has(fid)));
  }, [items, sourceFilter, selectedFolderIds, itemFolderMap]);

  type GalleryLayoutItem =
    | { kind: "pending"; pg: PendingGen; ratio: number; width: number }
    | { kind: "gallery"; item: GalleryItem; ratio: number; width: number };

  // Justified row layout: items are packed into rows that each fill the full container width.
  // Zoom controls target row height — higher zoom = shorter rows = more items per row.
  const justifiedRows = useMemo(() => {
    if (containerWidth <= 0) return [] as Array<{ items: GalleryLayoutItem[]; height: number }>;
    const targetH = Math.max(80, Math.round(containerWidth / Math.max(1, zoom)));

    const toRatio = (ar: string | undefined, mediaType: "image" | "video", url: string): number => {
      const fallback = mediaType === "video" ? 16 / 9 : 4 / 3;
      if (ar && ar !== "auto") {
        const [w, h] = ar.split(":");
        const wn = parseFloat(w), hn = parseFloat(h);
        if (wn && hn) return wn / hn;
      }
      const cached = naturalRatioCache.get(url);
      if (cached) {
        const [w, h] = cached.split(" / ");
        const wn = parseFloat(w), hn = parseFloat(h);
        if (wn && hn) return wn / hn;
      }
      return fallback;
    };

    const toPendingEntry = (pg: PendingGen): GalleryLayoutItem => {
      const [ws, hs] = pg.aspectRatio.split(":");
      const w = parseFloat(ws), h = parseFloat(hs);
      return { kind: "pending" as const, pg, ratio: (w && h) ? w / h : 16 / 9, width: 0 };
    };

    // Pending gens are only shown in the "generated" source filter, not "uploaded".
    const allPendingVisible = sourceFilter === "generated"
      ? pendingGens.filter(pg => (pg.tab == null || pg.tab === tab) && (!selectedFolderIds || (pg.folderId != null && selectedFolderIds.has(pg.folderId))))
      : [];
    const activePendings = allPendingVisible.filter(pg => !pg.error && !pg.retried);
    const mixedPendings = allPendingVisible.filter(pg => !!pg.error || !!pg.retried);

    type Dated = { t: number; entry: GalleryLayoutItem };
    const mixed: Dated[] = [
      ...mixedPendings.map(pg => ({ t: pg.createdAt ? new Date(pg.createdAt).getTime() : Date.now(), entry: toPendingEntry(pg) })),
      ...filteredItems.map(item => ({ t: new Date(item.created_at).getTime(), entry: { kind: "gallery" as const, item, ratio: toRatio(item.aspect_ratio, item.mediaType, item.url), width: 0 } })),
    ].sort((a, b) => b.t - a.t);

    const allItems: GalleryLayoutItem[] = [
      ...activePendings.map(toPendingEntry),
      ...mixed.map(d => d.entry),
    ];

    const rows: Array<{ items: GalleryLayoutItem[]; height: number }> = [];
    let cur: GalleryLayoutItem[] = [];
    let ratioSum = 0;

    const sealRow = (items: GalleryLayoutItem[], rSum: number, rowH: number) => {
      const totalGaps = (items.length - 1) * GALLERY_GAP;
      const availW = containerWidth - totalGaps;
      rows.push({ items: items.map(it => ({ ...it, width: availW * it.ratio / rSum })), height: rowH });
    };

    for (const entry of allItems) {
      cur.push(entry);
      ratioSum += entry.ratio;
      const gaps = (cur.length - 1) * GALLERY_GAP;
      const h = (containerWidth - gaps) / ratioSum;
      if (h <= targetH) { sealRow(cur, ratioSum, h); cur = []; ratioSum = 0; }
    }
    if (cur.length > 0) {
      // Last (partial) row: keep natural widths at targetH so ratios aren't distorted.
      const totalGaps = (cur.length - 1) * GALLERY_GAP;
      const naturalW = cur.reduce((s, it) => s + targetH * it.ratio, 0);
      if (naturalW + totalGaps <= containerWidth) {
        rows.push({ items: cur.map(it => ({ ...it, width: targetH * it.ratio })), height: targetH });
      } else {
        sealRow(cur, ratioSum, (containerWidth - totalGaps) / ratioSum);
      }
    }

    return rows;
  }, [containerWidth, zoom, pendingGens, filteredItems, GALLERY_GAP, natRatioVersion, tab, sourceFilter, selectedFolderIds]);

  // Fixed-column justified layout: exactly `zoom` items per row, each row fills full width.
  // Last partial row keeps column widths consistent with full rows; empty slots are padded.
  const fixedRows = useMemo(() => {
    if (containerWidth <= 0) return [] as Array<{ items: GalleryLayoutItem[]; height: number; emptyCount: number }>;
    const allItems = justifiedRows.flatMap(row => row.items);
    const rows: Array<{ items: GalleryLayoutItem[]; height: number; emptyCount: number }> = [];
    const colWidth = (containerWidth - (zoom - 1) * GALLERY_GAP) / zoom;
    for (let i = 0; i < allItems.length; i += zoom) {
      const group = allItems.slice(i, i + zoom);
      const isFull = group.length === zoom;
      if (isFull) {
        const ratioSum = group.reduce((s, it) => s + it.ratio, 0);
        const totalGaps = (group.length - 1) * GALLERY_GAP;
        const availW = containerWidth - totalGaps;
        const height = availW / ratioSum;
        rows.push({ items: group.map(it => ({ ...it, width: availW * it.ratio / ratioSum })), height, emptyCount: 0 });
      } else {
        // Partial last row: each item gets the standard column width; height from average ratio.
        const avgRatio = group.reduce((s, it) => s + it.ratio, 0) / group.length;
        const height = colWidth / avgRatio;
        rows.push({ items: group.map(it => ({ ...it, width: colWidth })), height, emptyCount: zoom - group.length });
      }
    }
    return rows;
  }, [containerWidth, zoom, justifiedRows, GALLERY_GAP]);

  const orderedGalleryItems = useMemo(
    () => fixedRows.flatMap(r => r.items).filter((i): i is Extract<GalleryLayoutItem, { kind: "gallery" }> => i.kind === "gallery").map(i => i.item),
    [fixedRows],
  );

  // Fire probes for every uncached item without a stored aspect_ratio.
  // Images: 32px next/image probe (fast). Videos: <video preload="metadata"> probe.
  // Results are non-blocking for video (uses 16:9 default until resolved).
  useEffect(() => {
    const toProbe = filteredItems.filter(
      item => (!item.aspect_ratio || item.aspect_ratio === "auto") &&
              !naturalRatioCache.has(item.url),
    );
    if (toProbe.length === 0) return;

    let cancelled = false;
    const bump = () => { if (!cancelled) setNatRatioVersion(v => v + 1); };

    toProbe.forEach(item => {
      if (item.mediaType === "video") {
        const vid = document.createElement("video");
        vid.preload = "metadata";
        vid.onloadedmetadata = () => {
          if (vid.videoWidth && vid.videoHeight)
            naturalRatioCache.set(item.url, `${vid.videoWidth} / ${vid.videoHeight}`);
          else
            naturalRatioCache.set(item.url, "16 / 9");
          bump();
        };
        vid.onerror = () => { naturalRatioCache.set(item.url, "16 / 9"); bump(); };
        vid.src = item.url;
      } else {
        const probeUrl = item.imageUrls?.[0] ?? item.url;
        const img = new window.Image();
        img.onload = () => {
          if (img.naturalWidth && img.naturalHeight)
            naturalRatioCache.set(item.url, `${img.naturalWidth} / ${img.naturalHeight}`);
          bump();
        };
        img.onerror = () => { naturalRatioCache.set(item.url, "4 / 3"); bump(); };
        img.src = probeUrl;
      }
    });

    return () => { cancelled = true; };
  }, [filteredItems]);

  // Persist discovered aspect ratios whenever a new one is found so the next
  // cold page load skips the probe reflow entirely.
  useEffect(() => {
    try {
      const ratios = Object.fromEntries(naturalRatioCache);
      sessionStorage.setItem("hg-ratios", JSON.stringify(ratios));
    } catch {}
  }, [natRatioVersion]);

  // Persist loaded-image URLs on unmount so the shimmer is suppressed on the
  // next visit (images already in browser HTTP cache load instantly anyway).
  useEffect(() => {
    return () => {
      try { sessionStorage.setItem("hg-loaded", JSON.stringify([...loadedImageUrls])); } catch {}
    };
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!authLoaded) return <div style={{ flex: 1, background: "#0B0E14" }} />;


  return (
    <div style={{ flex: 1, background: "#0B0E14", display: "flex", flexDirection: "column", overflow: "hidden", color: "#fff", position: "relative" }}>
      <DotCanvasBackground />

      {/* ── Sub-navbar ── */}
      {user && <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 14px",
        height: "44px",
        background: "#0B0E14",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        flexShrink: 0,
        position: "relative",
        zIndex: 1,
      }}>
        {/* Left: source tabs */}
        <div style={{ display: "flex", gap: "2px" }}>
          {(["generated", "uploaded"] as const).map(src => (
            <button
              key={src}
              onClick={() => {
                setSourceFilter(src);
                const params = new URLSearchParams(searchParams.toString());
                params.set("source", src);
                router.replace(`${pathname}?${params.toString()}`);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "5px 12px",
                borderRadius: "8px",
                border: "none",
                background: sourceFilter === src ? "rgba(255,255,255,0.08)" : "transparent",
                color: sourceFilter === src ? "#ffffff" : "rgba(255,255,255,0.38)",
                fontSize: "13px",
                fontWeight: sourceFilter === src ? 500 : 400,
                cursor: "pointer",
                transition: "background 140ms, color 140ms",
                fontFamily: "inherit",
                letterSpacing: "-0.01em",
              }}
              onMouseEnter={e => { if (sourceFilter !== src) e.currentTarget.style.color = "rgba(255,255,255,0.65)"; }}
              onMouseLeave={e => { if (sourceFilter !== src) e.currentTarget.style.color = "rgba(255,255,255,0.38)"; }}
            >
              {src === "generated" ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              )}
              {src === "generated" ? "Generated" : "Uploaded"}
            </button>
          ))}
        </div>

        {/* Center: current folder breadcrumb */}
        {selectedFolderId && (() => {
          const path: string[] = [];
          let cur: (typeof folders)[0] | undefined = folders.find(f => f.id === selectedFolderId);
          while (cur) {
            path.unshift(cur.name);
            const parentId = cur.parentId;
            cur = parentId ? folders.find(f => f.id === parentId) : undefined;
          }
          return (
            <div style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              pointerEvents: "none",
              maxWidth: "40%",
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              <span style={{
                fontSize: "13px",
                fontWeight: 500,
                color: "rgba(255,255,255,0.6)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                letterSpacing: "-0.01em",
              }}>
                {path.map((name, i) => (
                  <span key={i}>
                    {i > 0 && <span style={{ color: "rgba(255,255,255,0.25)", margin: "0 4px" }}>/</span>}
                    <span style={{ color: i === path.length - 1 ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.45)" }}>{name}</span>
                  </span>
                ))}
              </span>
            </div>
          );
        })()}

        {/* Right: zoom slider */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35M8 11h6" />
          </svg>
          <input
            type="range"
            min={4} max={8} step={1}
            value={12 - zoom}
            onChange={e => setZoom(12 - Number(e.target.value))}
            className="gallery-zoom-slider"
          />
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35M11 8v6M8 11h6" />
          </svg>
        </div>
      </div>}

      {/* ── Grid ── */}
      {!user && process.env.NEXT_PUBLIC_GUEST_MODE !== "true" ? <GalleryLoggedOut tab={tab} /> : <div ref={gridOuterRef} style={{ flex: 1, overflowY: "auto", paddingBottom: "260px", display: "flex", flexDirection: "column", userSelect: marqueeRect ? "none" : undefined, cursor: marqueeRect ? "crosshair" : undefined }} onMouseDown={e => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest("button, .gallery-action-btn, .gallery-checkbox")) return;
        marqueeStartRef.current = { x: e.clientX, y: e.clientY };
        preDragSelectedIdsRef.current = new Set(selectedIds);
      }}>
        {loading || containerWidth === 0 ? (
          /* Skeleton — shown while loading or before container is measured */
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${zoom}, 1fr)`, gap: "1px", padding: "1px", alignItems: "start" }}>
            {Array.from({ length: zoom * 3 }).map((_, i) => (
              <div key={i} className="gallery-skeleton" style={{ aspectRatio: i % 3 === 1 ? "4 / 5" : i % 5 === 0 ? "16 / 9" : "1 / 1" }} />
            ))}
          </div>
        ) : filteredItems.length === 0 && (sourceFilter !== "generated" || pendingGens.filter(pg => pg.tab == null || pg.tab === tab).length === 0) ? (
          <GalleryLoggedOut tab={tab} />
        ) : (
          <div ref={gridRef} style={{ padding: "1px" }}>
            {fixedRows.map((row, rowIdx) => (
              <div key={rowIdx} style={{ display: "flex", height: row.height, gap: `${GALLERY_GAP}px`, marginBottom: rowIdx < fixedRows.length - 1 ? `${GALLERY_GAP}px` : 0 }}>
                {row.items.map((layoutItem) => {
              if (layoutItem.kind === "pending") {
                const pg = layoutItem.pg;
                return (
                  <div key={pg.id} className={pg.error ? "error-pending-tile" : undefined} style={{
                    width: layoutItem.width,
                    flex: "0 0 auto",
                    height: "100%",
                    position: "relative",
                    overflow: "hidden",
                    background: pg.error ? "#2a2427" : "#2a2d35",
                  }}>
                        {pg.error ? (
                          <>
                            {/* Top radial glow */}
                            <div style={{
                              position: "absolute", top: "-40%", left: "50%", transform: "translateX(-50%)",
                              width: "180%", height: "80%", pointerEvents: "none",
                              background: "radial-gradient(ellipse at 50% 20%, rgba(180,40,40,0.38) 0%, transparent 70%)",
                            }} />
                            {/* Error card body */}
                            <div style={{
                              position: "absolute", inset: 0,
                              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                              gap: "8px", padding: "16px",
                              zIndex: 1,
                            }}>
                              {/* Icon with border ring + glow */}
                              <div style={{
                                width: 40, height: 40, borderRadius: "50%",
                                border: "1px solid rgba(248,113,113,0.45)",
                                boxShadow: "0 0 18px 4px rgba(200,50,50,0.35), inset 0 0 8px rgba(248,113,113,0.08)",
                                background: "rgba(30,10,10,0.6)",
                                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                              }}>
                                <ShieldAlert size={18} strokeWidth={1.75} style={{ color: "#f87171" }} />
                              </div>
                              {/* Tag */}
                              <span style={{
                                fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
                                color: "rgba(248,113,113,0.8)",
                                background: "rgba(120,30,30,0.35)",
                                padding: "2px 8px", borderRadius: "4px",
                              }}>
                                {(pg.error === "moderation_blocked" || pg.error?.includes?.("moderation_blocked") || pg.error?.includes?.("flagged as sensitive") || pg.error?.includes?.("moderation")) ? "Moderation" : "Failed"}
                              </span>
                              {/* Error message */}
                              <div style={{
                                fontSize: "11px", color: "rgba(255,255,255,0.75)", textAlign: "center",
                                lineHeight: 1.5, wordBreak: "break-word",
                                display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden",
                              }}>
                                {pg.error}
                              </div>
                              {/* Credits refunded — only for moderation */}
                              {(pg.error === "moderation_blocked" || pg.error?.includes?.("moderation_blocked") || pg.error?.includes?.("flagged as sensitive") || pg.error?.includes?.("moderation")) && (
                                <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.28)", fontFamily: "monospace", marginTop: 2 }}>
                                  Credits refunded
                                </div>
                              )}
                            </div>
                            {/* Action buttons column */}
                            <div className="error-tile-actions" style={{ position: "absolute", top: 8, right: 8, display: "flex", flexDirection: "column", gap: 5, zIndex: 5 }}>
                              <button className="gallery-action-btn" title="Paste prompt & images" onClick={() => handleCopyPrompt(pg.prompt, pg.referenceImageUrls)}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                </svg>
                              </button>
                              <button className="gallery-action-btn" title="Retry" onClick={async () => {
                                const newId = randomUUID();
                                const newPending: PendingGen = { id: newId, aspectRatio: pg.aspectRatio, prompt: pg.prompt, referenceImageUrls: pg.referenceImageUrls, createdAt: pg.createdAt ?? new Date().toISOString(), tab: pg.tab, retried: true, folderId: pg.folderId };
                                setPendingGens(prev => [...prev.filter(p => p.id !== pg.id), newPending]);
                                const token = await getToken();
                                if (!token) { setPendingGens(prev => prev.map(p => p.id === newId ? { ...p, error: "Please sign in." } : p)); return; }
                                const storedRefs = pg.referenceImageUrls ?? [];
                                const retryIsVideo = pg.tab === "videos";
                                let taskId: string;
                                try {
                                  if (retryIsVideo) {
                                    const vm = VIDEO_MODELS.find(m => m.id === modelId);
                                    const isVeo = !!(vm?.apiInput.useGoogleVeo);
                                    const res = await fetch("/api/generate-video", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(isVeo ? {
                                      model: modelId, prompt: pg.prompt, aspect_ratio: pg.aspectRatio, generationType: "TEXT_2_VIDEO",
                                      imageUrls: storedRefs, enableTranslation: true, enableFallback: false, watermark: "",
                                    } : {
                                      videoModel: modelId, prompt: pg.prompt, aspectRatio: pg.aspectRatio, duration, mode, resolution, sound,
                                      ...(storedRefs.length > 0 ? { referenceImageUrls: storedRefs } : {}),
                                    }) });
                                    const d = await res.json() as { taskId?: string; error?: string };
                                    if (!res.ok) throw new Error(d.error ?? "Failed");
                                    taskId = d.taskId!;
                                  } else {
                                    const syntheticTagged: TaggedImage[] = storedRefs.map((url, i) => ({ label: `image${i + 1}`, refId: url, url }));
                                    const { resolvedPrompt, extraUrls } = resolveGalleryMentions(pg.prompt, syntheticTagged);
                                    const dedupedExtra = new Set(extraUrls);
                                    const imageUrls = [...extraUrls, ...storedRefs.filter(u => !dedupedExtra.has(u))];
                                    const azureBaseUrl    = (() => { try { return localStorage.getItem("aiui-azure-base-url") ?? ""; } catch { return ""; } })();
                                    const azureDeployment = (() => { try { return JSON.parse(localStorage.getItem("aiui-azure-endpoints") ?? "{}")[modelId] ?? ""; } catch { return ""; } })();
                                    const providerForModel = (() => { try { return JSON.parse(localStorage.getItem("aiui-model-providers") ?? "{}")[modelId] ?? "kie"; } catch { return "kie"; } })();
                                    const isAzure = !!(azureBaseUrl && azureDeployment && providerForModel === "azure");
                                    const isCodex = providerForModel === "codex";
                                    const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ prompt: resolvedPrompt, model: modelId, aspectRatio: pg.aspectRatio, quality, imageUrls, ...(isAzure ? { azureBaseUrl, azureDeployment, azureQuality: quality } : {}), ...(isCodex ? { codexProvider: true } : {}) }) });
                                    const d = await res.json() as { taskId?: string; error?: string };
                                    if (!res.ok) throw new Error(d.error ?? "Failed");
                                    taskId = d.taskId!;
                                  }
                                  setPendingGens(prev => prev.map(p => p.id === newId ? { ...p, taskId } : p));
                                } catch (e: unknown) {
                                  setPendingGens(prev => prev.map(p => p.id === newId ? { ...p, error: e instanceof Error ? e.message : String(e) } : p));
                                  return;
                                }
                                try {
                                  await pollTask(taskId);
                                  const existingIds = new Set((galleryCache.get(`${tabRef.current}-generation`)?.items ?? []).map((i: GalleryItem) => i.id));
                                  const fresh = await fetchNewItems(tabRef.current);
                                  setPendingGens(prev => prev.filter(p => p.id !== newId));
                                  if (fresh.length > 0) {
                                    if (newPending.folderId) {
                                      const existingMap = useFolderStore.getState().itemFolderMap;
                                      const pendingTime = newPending.createdAt ? new Date(newPending.createdAt).getTime() - 30_000 : 0;
                                      const untaggedIds = fresh
                                        .filter(i => new Date(i.created_at).getTime() >= pendingTime)
                                        .map(i => i.id)
                                        .filter(id => !existingMap[id]);
                                      if (untaggedIds.length > 0) assignItemsToFolder(untaggedIds, newPending.folderId);
                                    }
                                    const genCacheKey = `${tabRef.current}-generation`;
                                    setItems(prev => {
                                      const base = sourceFilterRef.current === "generated" ? prev : (galleryCache.get(genCacheKey)?.items ?? []);
                                      const merged = mergeByNewest(base, fresh);
                                      galleryCache.set(genCacheKey, { items: merged, hasMore: true });
                                      return sourceFilterRef.current === "generated" ? (merged === base ? prev : merged) : prev;
                                    });
                                  }
                                  onGenComplete(newPending.folderId, fresh.filter(i => !existingIds.has(i.id)).map(i => i.id));
                                  window.dispatchEvent(new Event("credits-refresh"));
                                } catch (e: unknown) {
                                  setPendingGens(prev => prev.map(p => p.id === newId ? { ...p, error: e instanceof Error ? e.message : String(e) } : p));
                                }
                              }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                                </svg>
                              </button>
                              <button className="gallery-action-btn gallery-delete-btn" title="Dismiss" onClick={() => setPendingGens(prev => prev.filter(p => p.id !== pg.id))}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                                </svg>
                              </button>
                            </div>
                          </>
                        ) : (
                          <PendingGenTile
                            pg={pg}
                            onCancel={() => setPendingGens(prev => prev.filter(p => p.id !== pg.id))}
                          />
                        )}
                      </div>
                    );
                  }
                  return (
                    <div key={layoutItem.item.id} data-item-id={layoutItem.item.id} style={{ width: layoutItem.width, flex: "0 0 auto", height: "100%", overflow: "hidden", background: selectedIds.has(layoutItem.item.id) ? "#ffffff" : "transparent", transition: "background 180ms ease" }}>
                      <GalleryCard
                        item={layoutItem.item}
                        displayWidth={layoutItem.width}
                        onOpen={(thumbUrl) => { setLightboxItem(layoutItem.item); setLightboxThumb(thumbUrl); }}
                        onAddReference={layoutItem.item.mediaType === "image" && canAddImgs ? handleAddReference : undefined}
                        onCopyPrompt={handleCopyPrompt}
                        onDownload={handleDownload}
                        onDelete={handleDelete}
                        videoMuted={videoMuted}
                        onToggleMute={() => setVideoMuted(m => !m)}
                        onNaturalRatioDiscovered={() => setNatRatioVersion(v => v + 1)}
                        selected={selectedIds.has(layoutItem.item.id)}
                        anySelected={anySelected}
                        onSelect={() => toggleSelect(layoutItem.item.id)}
                        scrollContainer={gridOuterRef}
                        isTagged={taggedImages.some(t => t.refId === layoutItem.item.id)}
                        isNew={newItemIds.has(layoutItem.item.id)}
                        onMarkSeen={() => setNewItemIds(prev => { const n = new Set(prev); n.delete(layoutItem.item.id); return n; })}
                      />
                    </div>
                  );
                })}
                {Array.from({ length: row.emptyCount }).map((_, i) => (
                  <div key={`empty-${i}`} style={{ flex: "0 0 auto", width: row.items[0]?.width ?? 0, height: "100%" }} />
                ))}
              </div>
            ))}
          </div>
        )}
        {loadingMore && (
          <div style={{ padding: "20px", display: "flex", justifyContent: "center" }}>
            <span style={{ width: "20px", height: "20px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "rgba(255,255,255,0.4)", animation: "spin 0.8s linear infinite" }} />
          </div>
        )}
        <div ref={sentinelRef} style={{ height: "1px", width: "100%" }} />
      </div>}

      {/* ── Marquee selection overlay ── */}
      {marqueeRect && (
        <div style={{
          position: "fixed",
          left: marqueeRect.x,
          top: marqueeRect.y,
          width: marqueeRect.w,
          height: marqueeRect.h,
          border: "2px solid #2dd4bf",
          background: "rgba(45,212,191,0.08)",
          borderRadius: 3,
          pointerEvents: "none",
          zIndex: 9999,
        }} />
      )}

      {/* ── Hidden file input ── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={e => { if (e.target.files) { handleFilePick(e.target.files); e.target.value = ""; } }}
      />
      <input ref={vidImgInputRef}   type="file" accept="image/*" multiple style={{ display: "none" }}
        onChange={e => { if (e.target.files && vidPickTarget.current) { handleVidFilePick(e.target.files, vidPickTarget.current); e.target.value = ""; } }} />
      <input ref={vidVideoInputRef} type="file" accept="video/*" multiple style={{ display: "none" }}
        onChange={e => { if (e.target.files && vidPickTarget.current) { handleVidFilePick(e.target.files, vidPickTarget.current); e.target.value = ""; } }} />
      <input ref={vidAudioInputRef} type="file" accept="audio/*" multiple style={{ display: "none" }}
        onChange={e => { if (e.target.files && vidPickTarget.current) { handleVidFilePick(e.target.files, vidPickTarget.current); e.target.value = ""; } }} />

      {/* ── Selection toolbar ── */}
      <div style={{
        position: "fixed",
        bottom: "20px",
        left: isMobile ? "50%" : state === "collapsed" ? "calc(var(--sidebar-width-icon) / 2 + 50%)" : "calc(var(--sidebar-width) / 2 + 50%)",
        transform: `translateX(-50%) translateY(${anySelected ? "0" : "80px"})`,
        opacity: anySelected ? 1 : 0,
        transition: "transform 300ms cubic-bezier(0.16,1,0.3,1), opacity 240ms ease, left 200ms ease-linear",
        pointerEvents: anySelected ? "auto" : "none",
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "8px 8px 8px 16px",
        background: "rgba(14,16,18,0.92)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "16px",
        boxShadow: "0 8px 40px rgba(0,0,0,0.8), 0 2px 12px rgba(0,0,0,0.5)",
        fontFamily: "inherit",
      }}>
        <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.55)", fontWeight: 500, paddingRight: "6px", whiteSpace: "nowrap" }}>
          {selectedIds.size} selected
        </span>
        <div style={{ width: "1px", height: "20px", background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />
        <button
          onClick={handleDownloadSelected}
          style={{
            display: "flex", alignItems: "center", gap: "7px",
            padding: "7px 14px", borderRadius: "10px", border: "none",
            background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.85)",
            fontSize: "13px", fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
            transition: "background 140ms",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.13)")}
          onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download
        </button>
        <button
          onClick={handleDeleteSelected}
          style={{
            display: "flex", alignItems: "center", gap: "7px",
            padding: "7px 14px", borderRadius: "10px", border: "none",
            background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.85)",
            fontSize: "13px", fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
            transition: "background 140ms, color 140ms",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.15)"; e.currentTarget.style.color = "#f87171"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = "rgba(255,255,255,0.85)"; }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
          Remove
        </button>
        {/* Add to folder button + popup */}
        {folders.length > 0 && (() => {
          const selectedArr = [...selectedIds];
          return (
            <div style={{ position: "relative", flexShrink: 0 }}>
              <button
                ref={folderPickerBtnRef}
                onClick={() => setFolderPickerOpen(o => !o)}
                style={{
                  display: "flex", alignItems: "center", gap: "7px",
                  padding: "7px 14px", borderRadius: "10px", border: "none",
                  background: folderPickerOpen ? "rgba(45,212,191,0.12)" : "rgba(255,255,255,0.07)",
                  color: folderPickerOpen ? "#2DD4BF" : "rgba(255,255,255,0.85)",
                  fontSize: "13px", fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                  transition: "background 140ms, color 140ms",
                }}
                onMouseEnter={e => { if (!folderPickerOpen) { e.currentTarget.style.background = "rgba(255,255,255,0.13)"; } }}
                onMouseLeave={e => { if (!folderPickerOpen) { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; } }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                Add to folder
              </button>

              {/* Popup */}
              {folderPickerOpen && (
                <div
                  ref={folderPickerRef}
                  style={{
                    position: "absolute",
                    bottom: "calc(100% + 10px)",
                    left: "50%",
                    transform: "translateX(-50%)",
                    minWidth: "220px",
                    background: "rgba(14,16,20,0.97)",
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "14px",
                    boxShadow: "0 16px 48px rgba(0,0,0,0.85), 0 2px 8px rgba(0,0,0,0.4)",
                    overflow: "hidden",
                    zIndex: 400,
                  }}
                >
                  {/* Header */}
                  <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <span style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)" }}>
                      Add to folder
                    </span>
                  </div>

                  {/* Folder rows – tree view */}
                  <div style={{ padding: "6px 0", maxHeight: "280px", overflowY: "auto" }}>
                    {(() => {
                      const getIds = (id: string) => itemFolderMap[id] ?? [];

                      const renderFolder = (folder: typeof folders[0], depth: number): React.ReactNode => {
                        const checkedCount = selectedArr.filter(id => getIds(id).includes(folder.id)).length;
                        const allChecked = checkedCount === selectedArr.length && selectedArr.length > 0;
                        const someChecked = checkedCount > 0 && !allChecked;
                        const totalInFolder = items.filter(it => (itemFolderMap[it.id] ?? []).includes(folder.id)).length;
                        const toAddCount = selectedArr.filter(id => !getIds(id).includes(folder.id)).length;
                        const children = folders.filter(f => f.parentId === folder.id).sort((a, b) => a.orderIndex - b.orderIndex);
                        const hasChildren = children.length > 0;
                        const isExpanded = expandedPickerFolders.has(folder.id);

                        const toggleFolder = () => {
                          if (allChecked) {
                            removeItemsFromFolder(selectedArr, folder.id);
                          } else {
                            assignItemsToFolder(selectedArr, folder.id);
                          }
                        };

                        const toggleExpand = (e: React.MouseEvent) => {
                          e.stopPropagation();
                          setExpandedPickerFolders(prev => {
                            const next = new Set(prev);
                            next.has(folder.id) ? next.delete(folder.id) : next.add(folder.id);
                            return next;
                          });
                        };

                        return (
                          <React.Fragment key={folder.id}>
                            <div
                              onClick={toggleFolder}
                              style={{
                                display: "flex", alignItems: "center", gap: "6px",
                                padding: "8px 14px 8px", paddingLeft: `${14 + depth * 18}px`,
                                cursor: "pointer", transition: "background 120ms",
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                            >
                              {/* Expand/collapse chevron */}
                              <div
                                onClick={hasChildren ? toggleExpand : undefined}
                                style={{
                                  width: "14px", height: "14px", flexShrink: 0, cursor: hasChildren ? "pointer" : "default",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  color: "rgba(255,255,255,0.3)",
                                }}
                              >
                                {hasChildren && (
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                    style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 150ms" }}>
                                    <path d="M9 18l6-6-6-6"/>
                                  </svg>
                                )}
                              </div>

                              {/* Folder icon */}
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={allChecked ? "#2DD4BF" : someChecked ? "rgba(45,212,191,0.5)" : "rgba(255,255,255,0.35)"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transition: "stroke 150ms" }}>
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                              </svg>

                              {/* Name + count */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: "13px", color: (allChecked || someChecked) ? "#fff" : "rgba(255,255,255,0.75)", fontWeight: 500, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                                  {folder.name}
                                </div>
                                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: "1px" }}>
                                  {!allChecked && toAddCount > 0
                                    ? `${totalInFolder} → ${totalInFolder + toAddCount} item${totalInFolder + toAddCount !== 1 ? "s" : ""}`
                                    : `${totalInFolder} item${totalInFolder !== 1 ? "s" : ""}`}
                                </div>
                              </div>

                              {/* Checkbox */}
                              <div
                                onClick={e => { e.stopPropagation(); toggleFolder(); }}
                                style={{
                                  width: "18px", height: "18px", borderRadius: "5px", flexShrink: 0, cursor: "pointer",
                                  border: `2px solid ${allChecked ? "#fff" : someChecked ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.45)"}`,
                                  background: allChecked ? "#fff" : someChecked ? "rgba(255,255,255,0.15)" : "transparent",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  transition: "background 120ms, border-color 120ms",
                                }}
                              >
                                {allChecked && (
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0B0E14" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M20 6 9 17l-5-5"/>
                                  </svg>
                                )}
                                {someChecked && !allChecked && (
                                  <svg width="10" height="2" viewBox="0 0 10 2" fill="none">
                                    <rect width="10" height="2" rx="1" fill="#0B0E14"/>
                                  </svg>
                                )}
                              </div>
                            </div>
                            {hasChildren && isExpanded && children.map(child => renderFolder(child, depth + 1))}
                          </React.Fragment>
                        );
                      };

                      const rootFolders = folders.filter(f => f.parentId === null).sort((a, b) => a.orderIndex - b.orderIndex);
                      return rootFolders.map(f => renderFolder(f, 0));
                    })()}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        <div style={{ width: "1px", height: "20px", background: "rgba(255,255,255,0.1)", flexShrink: 0, marginLeft: "2px" }} />
        <button
          onClick={clearSelection}
          title="Cancel selection"
          style={{
            width: "34px", height: "34px", borderRadius: "10px", border: "none",
            background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", flexShrink: 0, transition: "background 140ms, color 140ms",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.13)"; e.currentTarget.style.color = "#fff"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = "rgba(255,255,255,0.55)"; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ── Prompt bar ── */}
      <div
        ref={promptBarRef}
        style={{
          position: "fixed",
          bottom: "32px",
          left: promptExpanded ? "50%" : (isMobile ? "50%" : state === "collapsed" ? "calc(var(--sidebar-width-icon) / 2 + 50%)" : "calc(var(--sidebar-width) / 2 + 50%)"),
          transform: `translateX(-50%) translateY(${anySelected && !promptExpanded ? "200px" : "0"})`,
          opacity: anySelected && !promptExpanded ? 0 : 1,
          transition: "transform 350ms cubic-bezier(0.4,0,0.2,1), opacity 240ms ease, left 350ms cubic-bezier(0.4,0,0.2,1), width 350ms cubic-bezier(0.4,0,0.2,1), height 350ms cubic-bezier(0.4,0,0.2,1)",
          pointerEvents: anySelected && !promptExpanded ? "none" : "auto",
          width: promptExpanded ? "75vw" : "min(860px, calc(100vw - 32px))",
          height: promptExpanded ? "75vh" : "auto",
          zIndex: 200,
        }}
      >

        {/* Toast */}
        {genError && (
          <div style={{
            marginBottom: "8px",
            padding: "8px 14px",
            background: "rgba(248,113,113,0.1)",
            border: "1px solid rgba(248,113,113,0.2)",
            borderRadius: "10px",
            fontSize: "12px",
            color: "#f87171",
          }}>
            {genError}
          </div>
        )}

        <div style={{
          position: "relative",
          background: "rgba(14,16,18,0.55)",
          backdropFilter: "blur(48px)",
          WebkitBackdropFilter: "blur(48px)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "18px",
          boxShadow: "0 28px 80px rgba(0,0,0,0.9), 0 4px 20px rgba(0,0,0,0.5)",
          overflow: "hidden",
          height: promptExpanded ? "100%" : undefined,
          display: promptExpanded ? "flex" : undefined,
          flexDirection: promptExpanded ? "column" : undefined,
        }}>

          {/* Clear prompt button */}
          {(prompt || refImages.length > 0 || taggedImages.length > 0 || vidElements.length > 0 || vidStartFrame || vidEndFrame || vidVideoRef || vidResources.length > 0 || vidRefVideos.length > 0 || vidRefAudios.length > 0) && (
            <button
              onClick={() => {
                refImages.forEach(r => URL.revokeObjectURL(r.objectUrl));
                setPrompt("");
                setRefImages([]);
                setTaggedImages([]);
                setVidElements([]);
                setVidStartFrame(null);
                setVidEndFrame(null);
                setVidVideoRef(null);
                setVidResources([]);
                setVidRefVideos([]);
                setVidRefAudios([]);
              }}
              title="Clear prompt"
              style={{
                position: "absolute",
                top: "10px",
                right: "46px",
                width: "26px",
                height: "26px",
                borderRadius: "8px",
                border: "none",
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                zIndex: 10,
                transition: "background 140ms, color 140ms",
                flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(248,113,113,0.15)"; e.currentTarget.style.color = "rgba(248,113,113,0.8)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}
            >
              <X size={12} strokeWidth={2.5} />
            </button>
          )}

          {/* Expand / collapse button */}
          <button
            onClick={() => setPromptExpanded(v => !v)}
            title={promptExpanded ? "Collapse prompt" : "Expand prompt"}
            style={{
              position: "absolute",
              top: "10px",
              right: "12px",
              width: "26px",
              height: "26px",
              borderRadius: "8px",
              border: "none",
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              zIndex: 10,
              transition: "background 140ms, color 140ms",
              flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "rgba(255,255,255,0.75)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}
          >
            {promptExpanded ? (
              <Minimize2 size={12} strokeWidth={2.2} />
            ) : (
              <Maximize2 size={12} strokeWidth={2.2} />
            )}
          </button>

          {/* ── Reference image thumbnails (Always visible, integrated) ── */}
          <div style={{ maxHeight: "200px", overflowY: "auto", borderBottom: "none" }}>
            {!isVideo && imgModel?.supportsImages && (hasRefImgs || canAddImgs) && (
              <div style={{ padding: "14px 16px 0", display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-start", paddingBottom: "14px" }} onPointerUp={() => { if (reorderDrag.item?.listTarget === "refImage") { reorderDrag.item = null; reorderDrag.overId = null; setDraggingId(null); setReorderOverId(null); } }}>
                {displayRefImages.map(img => {
                  const isRemoving = removingIds.has(img.id);
                  const isHovered = hoveredRefId === img.id;
                  const isDragging = draggingId === img.id;
                  return (
                    <div key={img.id} onMouseDown={e => e.preventDefault()} onPointerDown={e => { if (refImages.length <= 1 || img.uploading || img.error) return; reorderDrag.item = { id: img.id, listTarget: "refImage" }; reorderDrag.overId = null; setDraggingId(img.id); }} onPointerEnter={() => { if (!reorderDrag.item || reorderDrag.item.id === img.id || reorderDrag.item.listTarget !== "refImage") return; reorderDrag.overId = img.id; setReorderOverId(img.id); }} onPointerUp={e => { const info = reorderDrag.item; if (!info || info.listTarget !== "refImage") return; e.stopPropagation(); if (reorderDrag.overId) e.preventDefault(); const target = reorderDrag.overId ?? img.id; handleReorderDrop(target, "refImage"); }} onMouseEnter={() => { if (!draggingId) setHoveredRefId(img.id); }} onMouseLeave={() => setHoveredRefId(null)} onClick={() => { if (reorderDrag.justDropped) { reorderDrag.justDropped = false; return; } if (!img.uploading && !img.error && !draggingId) setRefPreview({ url: img.objectUrl, mediaKind: "image" }); }} onDragOver={e => { if (!e.dataTransfer.types.includes("application/x-gallery-item")) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; setDragOverSlotKey(`refimg-filled-${img.id}`); }} onDragLeave={() => setDragOverSlotKey(null)} onDrop={e => handleGalleryItemDrop(e, "refImage", "image")} style={{ position: "relative", width: "64px", height: "64px", borderRadius: "8px", overflow: "hidden", background: "#1A1C1F", flexShrink: 0, touchAction: refImages.length > 1 ? "none" : undefined, transition: "border 120ms, box-shadow 120ms, opacity 120ms", border: img.error ? "1px solid rgba(248,113,113,0.4)" : dragOverSlotKey === `refimg-filled-${img.id}` ? "2.5px solid #2DD4BF" : taggedImages.some(t => t.refId === img.id) ? "2.5px solid #10b981" : "1px solid rgba(255,255,255,0.08)", boxShadow: dragOverSlotKey === `refimg-filled-${img.id}` ? "0 0 0 3px rgba(45,212,191,0.25)" : undefined, cursor: (!img.uploading && !img.error) ? (refImages.length > 1 ? (draggingId === img.id ? "grabbing" : "grab") : "zoom-in") : "default", animation: isRemoving ? "none" : (isDragging ? "none" : "refImgIn 260ms cubic-bezier(0.16,1,0.3,1) backwards"), opacity: isDragging ? 0.3 : undefined, ...(isRemoving ? { transition: "opacity 170ms, transform 170ms", opacity: 0, transform: "translateY(-10px) scale(0.92)" } : {}) }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumbSrc(img.objectUrl, snapWidth(64))} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      {isHovered && !img.uploading && !img.error && (
                        <div onClick={e => { if (reorderDrag.justDropped || draggingId) { reorderDrag.justDropped = false; e.stopPropagation(); return; } e.stopPropagation(); setRefPreview({ url: img.objectUrl, mediaKind: "image" }); }} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-in" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg></div>
                      )}
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "8px 4px 3px", background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)", textAlign: "center" }}><span style={{ fontSize: "8px", fontWeight: 700, letterSpacing: "0.04em", color: "rgba(255,255,255,0.85)", textTransform: "uppercase" }}>Image</span></div>
                      {img.uploading && (<div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ width: "14px", height: "14px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.2)", borderTopColor: "#2DD4BF", display: "inline-block", animation: "spin 0.75s linear infinite" }} /></div>)}
                      {img.error && (<div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg></div>)}
                      <button onClick={e => { e.stopPropagation(); removeImage(img.id); }} style={{ position: "absolute", top: "3px", right: "3px", width: "16px", height: "16px", borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.85)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, fontSize: "10px", zIndex: 2 }}>
<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
                    </div>
                  );
                })}
                {canAddImgs && (
                  <button
                    onClick={() => openPicker("refImage", "image")}
                    disabled={submitting}
                    onDragOver={e => { if (!e.dataTransfer.types.includes("application/x-gallery-item")) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; setDragOverSlotKey("refImage-add"); }}
                    onDragLeave={() => setDragOverSlotKey(null)}
                    onDrop={e => handleGalleryItemDrop(e, "refImage", "image")}
                    style={{ width: "64px", height: "64px", borderRadius: "8px", border: dragOverSlotKey === "refImage-add" ? "2.5px solid #2DD4BF" : "1.5px dashed rgba(255,255,255,0.2)", boxShadow: dragOverSlotKey === "refImage-add" ? "0 0 0 3px rgba(45,212,191,0.25)" : undefined, background: dragOverSlotKey === "refImage-add" ? "rgba(45,212,191,0.07)" : "rgba(255,255,255,0.03)", cursor: submitting ? "not-allowed" : "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", color: dragOverSlotKey === "refImage-add" ? "#2DD4BF" : "rgba(255,255,255,0.45)", flexShrink: 0, transition: "all 140ms" }}>
                    <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.04em" }}>IMAGE</span>
                    <span style={{ fontSize: "8px", color: dragOverSlotKey === "refImage-add" ? "#2DD4BF" : "rgba(255,255,255,0.3)" }}>
                      {maxImgs - refImages.length} left
                    </span>

                  </button>
                )}
              </div>
            )}
            {isVideo && vidRefHandles.length > 0 && (() => {
              type VidSlot =
                | { kind: "filled"; target: "startFrame"|"endFrame"|"resource"|"videoRef"|"referenceVideo"|"audioRef"; mediaKind: "image"|"video"|"audio"; label: string; ref: RefImage }
                | { kind: "add";    target: "startFrame"|"endFrame"|"resource"|"videoRef"|"referenceVideo"|"audioRef"; mediaKind: "image"|"video"|"audio"; label: string; countLeft: number }
                | { kind: "element-filled"; element: KlingElement }
                | { kind: "element-add"; countLeft: number };
              const slots: VidSlot[] = [];
              const useElems = !!(vidModel?.apiInput.useKlingElements);
              const isHappyHorse = vidModel?.id === "happyhorse";
              const isVeo = modelId === "veo3" || modelId === "veo3_fast" || modelId === "veo3_lite";
              for (const h of vidRefHandles) {
                if (isVeo) {
                  if (veoMode === "references" && (h === "startFrame" || h === "endFrame")) continue;
                  if (veoMode === "frames" && h === "resource") continue;
                  if (h === "videoRef" || h === "referenceVideo" || h === "audioRef") continue;
                }
                if (isHappyHorse && h === "startFrame" && vidResources.length > 0) continue;
                if (isHappyHorse && h === "resource" && vidStartFrame) continue;
                const isSeedance = vidModel?.id === "seedance-2" || vidModel?.id === "seedance-2-fast";
                const seedanceHasFrame = !!(vidStartFrame || vidEndFrame);
                const seedanceHasRef   = vidResources.length > 0 || vidRefVideos.length > 0 || vidRefAudios.length > 0;
                if (isSeedance && seedanceHasFrame && (h === "resource" || h === "referenceVideo" || h === "audioRef")) continue;
                if (isSeedance && seedanceHasRef   && (h === "startFrame" || h === "endFrame")) continue;
                if (h === "startFrame") {
                  if (vidStartFrame) slots.push({ kind: "filled", target: h, mediaKind: "image", label: "Start Frame", ref: vidStartFrame });
                  else               slots.push({ kind: "add",    target: h, mediaKind: "image", label: "Start Frame", countLeft: 1 });
                } else if (h === "endFrame") {
                  if (vidEndFrame)   slots.push({ kind: "filled", target: h, mediaKind: "image", label: "End Frame", ref: vidEndFrame });
                  else               slots.push({ kind: "add",    target: h, mediaKind: "image", label: "End Frame", countLeft: 1 });
                } else if (h === "videoRef") {
                  if (vidVideoRef)   slots.push({ kind: "filled", target: h, mediaKind: "video", label: "Ref Video", ref: vidVideoRef });
                  else               slots.push({ kind: "add",    target: h, mediaKind: "video", label: "Ref Video", countLeft: 1 });
                } else if (h === "resource") {
                  if (useElems) {
                    vidElements.forEach(el => slots.push({ kind: "element-filled", element: el }));
                    if (vidElements.length < 3) slots.push({ kind: "element-add", countLeft: 3 - vidElements.length });
                  } else {
                    const maxRes = vidModel?.maxResources ?? 3;
                    const resLabel = vidModel?.id === "happyhorse" ? "Character" : "Image";
                    displayVidResources.forEach(r => slots.push({ kind: "filled", target: h, mediaKind: "image", label: resLabel, ref: r }));
                    if (vidResources.length < maxRes)
                      slots.push({ kind: "add", target: h, mediaKind: "image", label: resLabel, countLeft: maxRes - vidResources.length });
                  }
                } else if (h === "referenceVideo") {
                  const maxRefVid = vidModel?.maxReferenceVideos ?? 3;
                  displayVidRefVideos.forEach(r => slots.push({ kind: "filled", target: h, mediaKind: "video", label: "Ref Video", ref: r }));
                  if (vidRefVideos.length < maxRefVid)
                    slots.push({ kind: "add", target: h, mediaKind: "video", label: "Ref Video", countLeft: maxRefVid - vidRefVideos.length });
                } else if (h === "audioRef") {
                  const maxRefAud = vidModel?.maxReferenceAudios ?? 3;
                  displayVidRefAudios.forEach(r => slots.push({ kind: "filled", target: h, mediaKind: "audio", label: "Audio", ref: r }));
                  if (vidRefAudios.length < maxRefAud)
                    slots.push({ kind: "add", target: h, mediaKind: "audio", label: "Audio", countLeft: maxRefAud - vidRefAudios.length });
                }
              }
              return (
                <div style={{ padding: "14px 16px 14px", display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-start" }} onPointerUp={() => { if (reorderDrag.item) { reorderDrag.item = null; reorderDrag.overId = null; setDraggingId(null); setReorderOverId(null); } }}>
                  {slots.map((slot, idx) => {
                    if (slot.kind === "element-filled") {
                      const el = slot.element; const thumb = el.imageUrls[0]; const hovId = `elem-${el.id}`;
                      return (
                        <div key={el.id} onMouseEnter={() => setHoveredRefId(hovId)} onMouseLeave={() => setHoveredRefId(null)} style={{ position: "relative", width: "64px", height: "64px", borderRadius: "8px", overflow: "hidden", flexShrink: 0, background: "#1a1c1f", border: "1px solid rgba(255,255,255,0.12)" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          {hoveredRefId === hovId && (
                            <div onClick={() => setRefPreview({ url: thumb, mediaKind: "image" })} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-in", zIndex: 1 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg></div>
                          )}
                          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "8px 4px 3px", background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)", textAlign: "center" }}><span style={{ fontSize: "8px", fontWeight: 700, letterSpacing: "0.04em", color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block", padding: "0 4px" }}>{el.name.toUpperCase()}</span></div>
                          <button onClick={() => setVidElements(prev => prev.filter(e => e.id !== el.id))} style={{ position: "absolute", top: "3px", right: "3px", width: "16px", height: "16px", borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.85)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, transition: "background 120ms", zIndex: 2 }}><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
                        </div>
                        );
                        }
                        if (slot.kind === "element-add") {
                        return (
                        <button key={`element-add-${idx}`} onClick={() => setElementPickerOpen(true)} disabled={submitting} style={{ width: "64px", height: "64px", borderRadius: "8px", flexShrink: 0, border: "1.5px dashed rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.03)", cursor: submitting ? "not-allowed" : "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2px", color: "rgba(255,255,255,0.4)", transition: "all 140ms" }}>
                        <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.04em" }}>ELEM</span>
                        <span style={{ fontSize: "8px", color: "rgba(255,255,255,0.3)" }}>{slot.countLeft} left</span>
                        </button>
                        );
                        }
                        if (slot.kind === "filled") {
                        const r = slot.ref; const hovId = `slot-${r.id}`; const dragKey = `vidfilled-${r.id}`;
                        const isMultiTarget = slot.target === "resource" || slot.target === "referenceVideo" || slot.target === "audioRef";
                        const listForSlot = slot.target === "resource" ? vidResources : slot.target === "referenceVideo" ? vidRefVideos : vidRefAudios;
                        const isSlotDragging = draggingId === r.id;
                        return (
                        <div key={r.id} onMouseDown={e => e.preventDefault()} onPointerDown={e => { if (!isMultiTarget || listForSlot.length <= 1 || r.uploading || r.error) return; reorderDrag.item = { id: r.id, listTarget: slot.target as "resource"|"referenceVideo"|"audioRef" }; reorderDrag.overId = null; setDraggingId(r.id); }} onPointerEnter={() => { if (!reorderDrag.item || reorderDrag.item.id === r.id || reorderDrag.item.listTarget !== slot.target) return; reorderDrag.overId = r.id; setReorderOverId(r.id); }} onPointerUp={e => { const info = reorderDrag.item; if (!info || info.listTarget !== slot.target) return; e.stopPropagation(); if (reorderDrag.overId) e.preventDefault(); const target = reorderDrag.overId ?? r.id; handleReorderDrop(target, slot.target as "resource"|"referenceVideo"|"audioRef"); }} onMouseEnter={() => { if (!draggingId) setHoveredRefId(hovId); }} onMouseLeave={() => setHoveredRefId(null)} onDragOver={e => { if (slot.mediaKind === "audio" || !e.dataTransfer.types.includes("application/x-gallery-item")) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; setDragOverSlotKey(dragKey); }} onDragLeave={() => setDragOverSlotKey(null)} onDrop={e => { if (slot.mediaKind !== "audio") handleGalleryItemDrop(e, slot.target as NonNullable<typeof pickerTarget>, slot.mediaKind as "image" | "video"); }} style={{ position: "relative", width: "64px", height: "64px", borderRadius: "8px", overflow: "hidden", flexShrink: 0, background: "#1a1c1f", touchAction: (isMultiTarget && listForSlot.length > 1) ? "none" : undefined, transition: "border 120ms, box-shadow 120ms, opacity 120ms", border: r.error ? "1px solid rgba(248,113,113,0.4)" : dragOverSlotKey === dragKey ? "2.5px solid #2DD4BF" : taggedImages.some(t => t.refId === r.id) ? "2.5px solid #10b981" : "1px solid rgba(255,255,255,0.12)", boxShadow: dragOverSlotKey === dragKey ? "0 0 0 3px rgba(45,212,191,0.25)" : undefined, opacity: isSlotDragging ? 0.3 : undefined, cursor: (isMultiTarget && listForSlot.length > 1 && !r.uploading && !r.error) ? (draggingId === r.id ? "grabbing" : "grab") : undefined }}>
                          {slot.mediaKind === "image" ? <img src={thumbSrc(r.objectUrl, snapWidth(64))} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : slot.mediaKind === "video" ? <video src={r.objectUrl} autoPlay muted loop playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.04)" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>}
                          {hoveredRefId === hovId && !r.uploading && !r.error && slot.mediaKind !== "audio" && (
                            <div onClick={() => { if (reorderDrag.justDropped || draggingId) { reorderDrag.justDropped = false; return; } setRefPreview({ url: r.objectUrl, mediaKind: slot.mediaKind }); }} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-in", zIndex: 1 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg></div>
                          )}
                          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "8px 4px 3px", background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)", textAlign: "center" }}><span style={{ fontSize: "8px", fontWeight: 700, letterSpacing: "0.04em", color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block", padding: "0 4px" }}>{slot.label.toUpperCase()}</span></div>
                          <button onClick={() => removeVidRef(r.id, slot.target)} style={{ position: "absolute", top: "3px", right: "3px", width: "16px", height: "16px", borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.85)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, transition: "background 120ms", zIndex: 2 }}><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
                        </div>
                        );
                        }
                        const vidAddKey = `vidadd-${slot.target}-${idx}`;
                        return (
                        <button key={`${slot.target}-add-${idx}`} onClick={() => slot.mediaKind === "audio" ? (vidPickTarget.current = slot.target, vidAudioInputRef.current?.click()) : openPicker(slot.target as NonNullable<typeof pickerTarget>, slot.mediaKind)} disabled={submitting} onDragOver={e => { if (slot.mediaKind === "audio" || !e.dataTransfer.types.includes("application/x-gallery-item")) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; setDragOverSlotKey(vidAddKey); }} onDragLeave={() => setDragOverSlotKey(null)} onDrop={e => { if (slot.mediaKind !== "audio") handleGalleryItemDrop(e, slot.target as NonNullable<typeof pickerTarget>, slot.mediaKind as "image" | "video"); }} style={{ width: "64px", height: "64px", borderRadius: "8px", flexShrink: 0, border: dragOverSlotKey === vidAddKey ? "2.5px solid #2DD4BF" : "1.5px dashed rgba(255,255,255,0.2)", boxShadow: dragOverSlotKey === vidAddKey ? "0 0 0 3px rgba(45,212,191,0.25)" : undefined, background: dragOverSlotKey === vidAddKey ? "rgba(45,212,191,0.07)" : "rgba(255,255,255,0.03)", cursor: submitting ? "not-allowed" : "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2px", color: dragOverSlotKey === vidAddKey ? "#2DD4BF" : "rgba(255,255,255,0.4)", transition: "all 140ms" }}>
                        <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.04em" }}>{slot.label === "Ref Video" ? "VIDEO" : slot.label === "Audio" ? "AUDIO" : slot.label.toUpperCase()}</span>
                        <span style={{ fontSize: "8px", color: dragOverSlotKey === vidAddKey ? "#2DD4BF" : "rgba(255,255,255,0.3)" }}>{slot.countLeft} left</span>
                        </button>
                        );
                  })}
                </div>
              );
            })()}
          </div>

          {/* ── Prompt input ── */}
          {/* ── Input + Controls + Generate ── */}
          <div style={{
            padding: `${(isVideo && vidRefHandles.length > 0) || (!isVideo && !!imgModel?.supportsImages) ? 0 : 16}px 14px 14px 16px`,
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            flex: promptExpanded ? 1 : undefined,
          }}>
            {/* Multi-prompt mode strip */}
            {multiPromptMode && (
              <div style={{
                display: "flex", alignItems: "center", gap: "6px",
                fontSize: "11px", fontWeight: 500, color: "rgba(255,255,255,0.45)",
                letterSpacing: "0.02em", marginBottom: "-2px",
              }}>
                <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#2DD4BF", flexShrink: 0 }} />
                Multi <strong style={{ color: "#2DD4BF", fontWeight: 600 }}>on</strong>
                {" · "}
                {prompt.split(/\n\n+/).filter(p => p.trim()).length} prompt{prompt.split(/\n\n+/).filter(p => p.trim()).length !== 1 ? "s" : ""}
              </div>
            )}

            {/* Prompt input with inline mention chips — hidden in multi-prompt mode */}
            <div style={{ position: "relative", flex: promptExpanded ? "1 1 0" : "none", minHeight: 0, overflow: promptExpanded ? "hidden" : undefined, display: multiPromptMode ? "none" : undefined }}>
              {/* Transparent textarea — editing layer */}
              <textarea
                ref={inputRef}
                data-prompt-input=""
                value={prompt}
                rows={1}
                onChange={e => {
                  const text = e.target.value;
                  const cursor = e.target.selectionStart ?? text.length;
                  setPrompt(text);
                  if (!promptExpanded) resizeTextarea(e.target, 264);
                  if (!isVideo) {
                    const match = text.slice(0, cursor).match(/@(\w*)$/);
                    setMentionQuery(match ? match[1] : null);
                  }
                }}
                onSelect={e => {
                  const ta = e.currentTarget;
                  const cursor = ta.selectionStart ?? ta.value.length;
                  const match = ta.value.slice(0, cursor).match(/@(\w*)$/);
                  setMentionQuery(match ? match[1] : null);
                }}
                onScroll={e => {
                  if (overlayInnerRef.current)
                    overlayInnerRef.current.style.transform = `translateY(-${e.currentTarget.scrollTop}px)`;
                }}
                onKeyDown={e => {
                  if (atMenuOpen) {
                    if (e.key === "ArrowDown") { e.preventDefault(); setMentionSelIdx(i => (i + 1) % filteredMentions.length); return; }
                    if (e.key === "ArrowUp") { e.preventDefault(); setMentionSelIdx(i => (i - 1 + filteredMentions.length) % filteredMentions.length); return; }
                    if (e.key === "Enter") { e.preventDefault(); insertMention(filteredMentions[mentionSelIdx]); return; }
                    if (e.key === "Escape") { setMentionQuery(null); return; }
                  }
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !submitting) { e.preventDefault(); generate(); }
                }}
                disabled={submitting}
                style={{
                  position: "relative",
                  display: "block",
                  width: "100%",
                  ...(promptExpanded ? { height: "100%", maxHeight: "none" } : { maxHeight: "264px" }),
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "transparent",
                  caretColor: "#2DD4BF",
                  fontSize: "14.5px",
                  fontFamily: promptTextMode !== "text" ? "monospace" : "inherit",
                  lineHeight: "22px",
                  letterSpacing: promptTextMode !== "text" ? "normal" : "-0.01em",
                  padding: 0,
                  resize: "none",
                  overflowY: "auto",
                  scrollbarWidth: "none",
                } as React.CSSProperties}
              />
              {/* Chip overlay — visually replaces the transparent text */}
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  overflow: "hidden",
                  pointerEvents: "none",
                }}
              >
                <div
                  ref={overlayInnerRef}
                  style={{
                    display: "block",
                    fontSize: "14.5px",
                    fontFamily: promptTextMode !== "text" ? "monospace" : "inherit",
                    lineHeight: "22px",
                    letterSpacing: promptTextMode !== "text" ? "normal" : "-0.01em",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    willChange: "transform",
                  }}
                >
                  {promptTextMode !== "text" ? (
                    promptTextMode === "yaml"
                      ? syntaxHighlightYaml(prompt, taggedImages, (tag, rect) => setChipPreview({ tag, rect }), () => setChipPreview(null), tag => { const idx = prompt.indexOf(`@${tag.label}`); const pos = idx >= 0 ? idx + tag.label.length + 1 : prompt.length; inputRef.current?.focus(); inputRef.current?.setSelectionRange(pos, pos); })
                      : syntaxHighlightJson(prompt, taggedImages, (tag, rect) => setChipPreview({ tag, rect }), () => setChipPreview(null), tag => { const idx = prompt.indexOf(`@${tag.label}`); const pos = idx >= 0 ? idx + tag.label.length + 1 : prompt.length; inputRef.current?.focus(); inputRef.current?.setSelectionRange(pos, pos); })
                  ) : promptMaxLength !== null && prompt.length > promptMaxLength ? (
                    <>
                      {renderGalleryMentions(
                        prompt.slice(0, promptMaxLength), taggedImages,
                        (tag, rect) => setChipPreview({ tag, rect }),
                        () => setChipPreview(null),
                        tag => {
                          const idx = prompt.indexOf(`@${tag.label}`);
                          const pos = idx >= 0 ? idx + tag.label.length + 1 : prompt.length;
                          inputRef.current?.focus();
                          inputRef.current?.setSelectionRange(pos, pos);
                        },
                      )}
                      <span style={{ background: "rgba(239,68,68,0.22)", color: "#f87171", borderRadius: 2 }}>
                        {prompt.slice(promptMaxLength)}
                      </span>
                    </>
                  ) : renderGalleryMentions(
                    prompt, taggedImages,
                    (tag, rect) => setChipPreview({ tag, rect }),
                    () => setChipPreview(null),
                    tag => {
                      const idx = prompt.indexOf(`@${tag.label}`);
                      const pos = idx >= 0 ? idx + tag.label.length + 1 : prompt.length;
                      inputRef.current?.focus();
                      inputRef.current?.setSelectionRange(pos, pos);
                    },
                  )}
                </div>
              </div>
              {/* Placeholder */}
              {!prompt && (
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "block",
                    lineHeight: "22px",
                    fontSize: "14.5px",
                    fontFamily: "inherit",
                    letterSpacing: "-0.01em",
                    color: "rgba(255,255,255,0.3)",
                    pointerEvents: "none",
                  }}
                >
                  {isVideo ? "Describe the video you imagine…" : "Describe the scene you imagine…"}
                </div>
              )}
            </div>

            {/* Multi-prompt stack — blocks separated by \n\n */}
            {multiPromptMode && (() => {
              const blocks = prompt.split(/\n\n+/).reduce<string[]>((acc, b) => {
                if (!b.trim() && acc.some(x => !x.trim())) return acc; // max one empty block
                return [...acc, b];
              }, []);
              let promptIndex = 0;
              return (
                <div data-prompt-stack="" style={{
                  display: "flex", flexDirection: "column", gap: "6px",
                  maxHeight: promptExpanded ? "calc(75vh - 220px)" : "204px", overflowY: "auto", scrollbarWidth: "none",
                }}>
                  {blocks.map((block, blockIdx) => {
                    const isNonEmpty = !!block.trim();
                    const displayIdx = isNonEmpty ? ++promptIndex : null;
                    const isExpanded = expandedPromptIdx === blockIdx;
                    return (
                      <div
                        key={blockIdx}
                        onClick={(e) => {
                          const next = isExpanded ? null : blockIdx;
                          setExpandedPromptIdx(next);
                          if (next !== null) {
                            requestAnimationFrame(() => {
                              const stack = document.querySelector('[data-prompt-stack]');
                              const ta = stack?.querySelectorAll<HTMLTextAreaElement>('textarea')[blockIdx];
                              if (ta) ta.focus();
                            });
                          } else {
                            const rowEl = e.currentTarget as HTMLElement;
                            requestAnimationFrame(() => rowEl.scrollIntoView({ block: "nearest", behavior: "smooth" }));
                          }
                        }}
                        style={{
                          position: "relative",
                          display: "flex", alignItems: "flex-start", gap: "8px",
                          background: isExpanded ? "rgba(45,212,191,0.04)" : "rgba(255,255,255,0.03)",
                          border: `1px solid ${isExpanded ? "rgba(45,212,191,0.18)" : isNonEmpty ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.04)"}`,
                          borderRadius: "8px", padding: "7px 24px 7px 10px",
                          opacity: isNonEmpty ? 1 : 0.4,
                          cursor: isExpanded ? "default" : "pointer",
                          transition: "background 120ms, border-color 120ms",
                          flexShrink: 0,
                        }}
                      >
                        <span style={{
                          fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em",
                          color: isNonEmpty ? "#2DD4BF" : "rgba(255,255,255,0.25)",
                          fontFamily: "monospace", lineHeight: "22px", flexShrink: 0, minWidth: "18px",
                        }}>
                          {displayIdx !== null ? String(displayIdx).padStart(2, '0') : "—"}
                        </span>
                        <div data-block-wrapper="" style={{ flex: 1, position: "relative", minWidth: 0 }}>
                        <textarea
                          value={block}
                          rows={1}
                          data-prompt-input=""
                          placeholder={blockIdx === 0 && !isNonEmpty ? "Describe the scene you imagine…" : undefined}
                          onClick={e => { if (isExpanded) e.stopPropagation(); }}
                          onFocus={e => {
                            activeBlockRef.current = e.currentTarget;
                            activeBlockIdxRef.current = blockIdx;
                            const ta = e.currentTarget;
                            const cursor = ta.selectionStart ?? ta.value.length;
                            const match = ta.value.slice(0, cursor).match(/@(\w*)$/);
                            setMentionQuery(match ? match[1] : null);
                          }}
                          onSelect={e => {
                            const ta = e.currentTarget;
                            const cursor = ta.selectionStart ?? ta.value.length;
                            const match = ta.value.slice(0, cursor).match(/@(\w*)$/);
                            setMentionQuery(match ? match[1] : null);
                          }}
                          onScroll={e => {
                            const st = e.currentTarget.scrollTop;
                            const wrapper = (e.target as HTMLElement).closest('[data-block-wrapper]');
                            if (promptTextMode !== "text") {
                              const overlay = wrapper?.querySelector('[data-block-overlay]') as HTMLElement | null;
                              if (overlay) overlay.style.transform = `translateY(-${st}px)`;
                            } else {
                              const overlay = wrapper?.querySelector('[data-block-text-overlay]') as HTMLElement | null;
                              if (overlay) overlay.style.transform = `translateY(-${st}px)`;
                            }
                          }}
                          onChange={e => {
                            const newVal = e.target.value;
                            const cursor = e.target.selectionStart ?? newVal.length;
                            const match = newVal.slice(0, cursor).match(/@(\w*)$/);
                            setMentionQuery(match ? match[1] : null);
                            if (newVal.includes('\n\n')) {
                              // Double newline → split into a new block
                              const splitIdx = newVal.indexOf('\n\n');
                              const before = newVal.slice(0, splitIdx);
                              const after = newVal.slice(splitIdx + 2);
                              const raw = [...blocks.slice(0, blockIdx), before, after, ...blocks.slice(blockIdx + 1)];
                              const normalized = raw.reduce<string[]>((acc, b) => {
                                if (!b.trim() && acc.some(x => !x.trim())) return acc;
                                return [...acc, b];
                              }, []);
                              setPrompt(normalized.join('\n\n'));
                              const focusIdx = blockIdx + 1;
                              setExpandedPromptIdx(focusIdx);
                              activeBlockIdxRef.current = focusIdx;
                              requestAnimationFrame(() => {
                                const stack = document.querySelector('[data-prompt-stack]');
                                const rows = stack?.querySelectorAll<HTMLTextAreaElement>('textarea');
                                const newRow = rows?.[focusIdx];
                                if (newRow) {
                                  activeBlockRef.current = newRow;
                                  newRow.focus();
                                  newRow.setSelectionRange(0, 0);
                                }
                              });
                            } else {
                              const updated = [...blocks];
                              updated[blockIdx] = newVal;
                              setPrompt(updated.join('\n\n'));
                            }
                          }}
                          onKeyDown={e => {
                            if (atMenuOpen) {
                              if (e.key === "ArrowDown") { e.preventDefault(); setMentionSelIdx(i => (i + 1) % filteredMentions.length); return; }
                              if (e.key === "ArrowUp") { e.preventDefault(); setMentionSelIdx(i => (i - 1 + filteredMentions.length) % filteredMentions.length); return; }
                              if (e.key === "Enter") { e.preventDefault(); insertMention(filteredMentions[mentionSelIdx]); return; }
                              if (e.key === "Escape") { setMentionQuery(null); return; }
                            }
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !submitting) { e.preventDefault(); generate(); return; }
                            if (e.key === "Enter" && !isExpanded) {
                              // Expand collapsed block on Enter instead of inserting newline
                              e.preventDefault();
                              setExpandedPromptIdx(blockIdx);
                              requestAnimationFrame(() => {
                                const stack = document.querySelector('[data-prompt-stack]');
                                const ta = stack?.querySelectorAll<HTMLTextAreaElement>('textarea')[blockIdx];
                                if (ta) {
                                  ta.focus();
                                  ta.setSelectionRange(ta.value.length, ta.value.length);
                                }
                              });
                              return;
                            }
                            if ((e.key === "Backspace" || e.key === "Delete") && !block.trim() && blocks.length > 1) {
                              e.preventDefault();
                              const updated = blocks.filter((_, i) => i !== blockIdx);
                              setPrompt(updated.join('\n\n'));
                              const focusIdx = Math.max(0, blockIdx - 1);
                              setExpandedPromptIdx(focusIdx);
                              requestAnimationFrame(() => {
                                const stack = document.querySelector('[data-prompt-stack]');
                                const rows = stack?.querySelectorAll<HTMLTextAreaElement>('textarea');
                                const target = rows?.[focusIdx];
                                if (target) {
                                  target.focus();
                                  target.setSelectionRange(target.value.length, target.value.length);
                                }
                              });
                            }
                          }}
                          disabled={submitting}
                          style={{
                            display: "block", width: "100%",
                            background: "transparent", border: "none", outline: "none",
                            color: "transparent",
                            caretColor: "#2DD4BF",
                            fontSize: "13.5px",
                            fontFamily: promptTextMode !== "text" ? "monospace" : "inherit",
                            lineHeight: "22px",
                            letterSpacing: promptTextMode !== "text" ? "normal" : "-0.01em",
                            padding: 0, resize: "none",
                            ...(isExpanded
                              ? { fieldSizing: "content", maxHeight: "330px", overflowY: "auto", scrollbarWidth: "none" }
                              : { height: "22px", maxHeight: "22px", overflowY: "hidden", whiteSpace: "nowrap" }
                            ),
                          } as React.CSSProperties}
                        />
                        {promptTextMode !== "text" ? (
                          <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
                            <div
                              data-block-overlay=""
                              style={{
                                fontSize: "13.5px", fontFamily: "monospace", lineHeight: "22px",
                                whiteSpace: isExpanded ? "pre-wrap" : "nowrap",
                                wordBreak: "break-word",
                              }}
                            >
                              {promptTextMode === "yaml"
                                ? syntaxHighlightYaml(block, taggedImages, (tag, rect) => setChipPreview({ tag, rect }), () => setChipPreview(null), tag => { const stack = document.querySelector('[data-prompt-stack]'); const ta = stack?.querySelectorAll<HTMLTextAreaElement>('textarea')[blockIdx]; if (!ta) return; activeBlockRef.current = ta; activeBlockIdxRef.current = blockIdx; const pos = block.indexOf(`@${tag.label}`); ta.focus(); ta.setSelectionRange(pos >= 0 ? pos + tag.label.length + 1 : block.length, pos >= 0 ? pos + tag.label.length + 1 : block.length); })
                                : syntaxHighlightJson(block, taggedImages, (tag, rect) => setChipPreview({ tag, rect }), () => setChipPreview(null), tag => { const stack = document.querySelector('[data-prompt-stack]'); const ta = stack?.querySelectorAll<HTMLTextAreaElement>('textarea')[blockIdx]; if (!ta) return; activeBlockRef.current = ta; activeBlockIdxRef.current = blockIdx; const pos = block.indexOf(`@${tag.label}`); ta.focus(); ta.setSelectionRange(pos >= 0 ? pos + tag.label.length + 1 : block.length, pos >= 0 ? pos + tag.label.length + 1 : block.length); })}
                            </div>
                          </div>
                        ) : (
                          <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
                            <div
                              data-block-text-overlay=""
                              style={{
                                fontSize: "13.5px", fontFamily: "inherit", lineHeight: "22px",
                                letterSpacing: "-0.01em",
                                whiteSpace: isExpanded ? "pre-wrap" : "nowrap",
                                wordBreak: "break-word",
                                willChange: "transform",
                              }}
                            >
                              {renderGalleryMentions(
                                block,
                                taggedImages,
                                (tag, rect) => setChipPreview({ tag, rect }),
                                () => setChipPreview(null),
                                tag => {
                                  const stack = document.querySelector('[data-prompt-stack]');
                                  const ta = stack?.querySelectorAll<HTMLTextAreaElement>('textarea')[blockIdx];
                                  if (!ta) return;
                                  activeBlockRef.current = ta;
                                  activeBlockIdxRef.current = blockIdx;
                                  const pos = block.indexOf(`@${tag.label}`);
                                  ta.focus();
                                  ta.setSelectionRange(pos >= 0 ? pos + tag.label.length + 1 : block.length, pos >= 0 ? pos + tag.label.length + 1 : block.length);
                                },
                              )}
                            </div>
                          </div>
                        )}
                        </div>
                        {isNonEmpty && promptMaxLength !== null && (
                          <span style={{
                            fontSize: "10px", fontWeight: 600,
                            color: block.length > promptMaxLength ? "#f87171" : "rgba(255,255,255,0.25)",
                            fontFamily: "monospace", lineHeight: "22px",
                            fontVariantNumeric: "tabular-nums",
                            ...(isExpanded
                              ? { position: "absolute", bottom: "6px", right: "24px" }
                              : { flexShrink: 0 }
                            ),
                          } as React.CSSProperties}>
                            {block.length}/{promptMaxLength}
                          </span>
                        )}
                        {blocks.length > 1 && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              const updated = blocks.filter((_, i) => i !== blockIdx);
                              setPrompt(updated.join('\n\n'));
                              setExpandedPromptIdx(prev => {
                                if (prev === null) return null;
                                if (prev === blockIdx) return null;
                                return prev > blockIdx ? prev - 1 : prev;
                              });
                            }}
                            disabled={submitting}
                            style={{
                              position: "absolute", top: "50%", right: "5px",
                              transform: "translateY(-50%)",
                              width: "16px", height: "16px",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              background: "none", border: "none", padding: 0,
                              color: "rgba(255,255,255,0.3)",
                              cursor: submitting ? "not-allowed" : "pointer",
                              borderRadius: "4px",
                              fontSize: "12px", lineHeight: 1,
                              transition: "color 120ms",
                            }}
                            onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.75)")}
                            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Bottom row: controls + generate button — always stays at the bottom, never moves on expand */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "12px", marginTop: promptExpanded ? "auto" : "4px" }}>
              {/* Controls group */}
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap" }}>
                {/* Model picker */}
                <CustomDropdown
                  value={modelId}
                  onChange={setModelId}
                  disabled={submitting}
                  options={models.map(m => ({
                    value: m.id,
                    label: m.name,
                    group: ("provider" in m ? (m as { provider: string }).provider : undefined),
                    providerIcon: "provider" in m ? <ProviderIcon provider={(m as { provider: string }).provider} /> : undefined,
                  }))}
                  showChevron
                />

                {/* Backend picker — only for models with more than one backend to choose from */}
                {modelHasProviderChoice(modelId) && (
                  <CustomDropdown
                    value={providerId}
                    onChange={(v) => setModelProvider(modelId, v as (typeof PROVIDERS)[number]["id"])}
                    disabled={submitting}
                    options={PROVIDERS.map(p => ({ value: p.id, label: p.label, providerIcon: <ProviderBackendIcon id={p.id} /> }))}
                    showChevron
                  />
                )}

                {/* Quality */}
                {supportsQ && (
                  <CustomDropdown
                    value={quality}
                    onChange={setQuality}
                    disabled={submitting}
                    options={qualityOpts.map(q => ({ value: q, label: q.toUpperCase() }))}
                    icon={<DiamondIcon />}
                  />
                )}

                {/* Azure Resolution (gpt-image-2 + Azure provider only) */}
                {azureResolutionOpts.length > 0 && (
                  <CustomDropdown
                    value={azureResolution}
                    onChange={setAzureResolution}
                    disabled={submitting}
                    options={azureResolutionOpts.map(r => ({ value: r, label: r.toUpperCase() }))}
                    icon={<DiamondIcon />}
                  />
                )}

                {/* Aspect ratio */}
                {ratios.length > 0 && (
                  <AspectRatioDropdown
                    value={aspectRatio}
                    onChange={setAspectRatio}
                    disabled={submitting}
                    ratios={ratios}
                    allowCustom={isAzureProvider && azureResolutionOpts.length > 0}
                    customWidth={azureCustomWidth}
                    customHeight={azureCustomHeight}
                    onApplyCustom={(w, h) => {
                      setAzureCustomWidth(w);
                      setAzureCustomHeight(h);
                      setAspectRatio("custom");
                    }}
                  />
                )}

                {/* Duration (video) — stepper + slider pill */}
                {isVideo && durations.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", height: "36px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", flexShrink: 0, overflow: "hidden" }}>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); const i = Math.max(0, durations.indexOf(duration)); if (i > 0) setDuration(durations[i - 1]); }}
                      disabled={submitting || Math.max(0, durations.indexOf(duration)) <= 0}
                      style={{
                        width: "26px", height: "36px", flexShrink: 0,
                        border: "none", borderRight: "1px solid rgba(255,255,255,0.1)",
                        background: "transparent", color: "rgba(255,255,255,0.75)", fontSize: "14px", lineHeight: 1,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: (submitting || Math.max(0, durations.indexOf(duration)) <= 0) ? "not-allowed" : "pointer",
                        opacity: Math.max(0, durations.indexOf(duration)) <= 0 ? 0.35 : 1,
                        padding: 0,
                      }}
                    >−</button>
                    <button
                      ref={durPillRef}
                      onClick={() => durPickerOpen ? closeDurPicker() : openDurPicker()}
                      disabled={submitting}
                      style={{
                        display: "flex", alignItems: "center", gap: "5px",
                        height: "36px", padding: "0 9px",
                        border: "none",
                        background: durPickerOpen ? "rgba(255,255,255,0.08)" : "transparent",
                        color: "#fff", fontSize: "13px", fontFamily: "inherit",
                        cursor: submitting ? "not-allowed" : "pointer",
                        transition: "background 140ms",
                        flexShrink: 0,
                      }}>
                      <span style={{ fontVariantNumeric: "tabular-nums", display: "inline-block", width: "2ch", textAlign: "right" }}>{duration}</span><span>s</span>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2.5" strokeLinecap="round" style={{ transition: "transform 180ms cubic-bezier(0.16,1,0.3,1)", transform: durPickerOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); const i = Math.max(0, durations.indexOf(duration)); if (i < durations.length - 1) setDuration(durations[i + 1]); }}
                      disabled={submitting || Math.max(0, durations.indexOf(duration)) >= durations.length - 1}
                      style={{
                        width: "26px", height: "36px", flexShrink: 0,
                        border: "none", borderLeft: "1px solid rgba(255,255,255,0.1)",
                        background: "transparent", color: "rgba(255,255,255,0.75)", fontSize: "14px", lineHeight: 1,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: (submitting || Math.max(0, durations.indexOf(duration)) >= durations.length - 1) ? "not-allowed" : "pointer",
                        opacity: Math.max(0, durations.indexOf(duration)) >= durations.length - 1 ? 0.35 : 1,
                        padding: 0,
                      }}
                    >+</button>
                  </div>
                )}

                {/* Mode (video) */}
                {isVideo && vidModes.length > 0 && (
                  <CustomDropdown
                    value={mode}
                    onChange={setMode}
                    disabled={submitting}
                    options={vidModes.map(m => ({ value: m.value, label: m.label }))}
                  />
                )}

                {/* Resolution (video) */}
                {isVideo && (vidModel?.resolutions?.length ?? 0) > 0 && (
                  <CustomDropdown
                    value={resolution || vidModel!.defaultResolution!}
                    onChange={setResolution}
                    disabled={submitting}
                    options={vidModel!.resolutions!.map(r => ({ value: r, label: r }))}
                  />
                )}

                {/* Sound toggle (video) */}
                {isVideo && vidModel?.sound && (
                  <button
                    onClick={() => setSound(s => !s)}
                    disabled={submitting}
                    style={{
                      display: "flex", alignItems: "center", gap: "7px",
                      height: "36px", padding: "0 12px",
                      borderRadius: "8px",
                      border: "1px solid rgba(255,255,255,0.1)",
                      background: sound ? "rgba(94,234,212,0.12)" : "rgba(255,255,255,0.05)",
                      color: sound ? "#5EEAD4" : "rgba(255,255,255,0.55)",
                      fontSize: "13px", fontFamily: "inherit",
                      cursor: submitting ? "not-allowed" : "pointer",
                      transition: "background 150ms, color 150ms, border-color 150ms",
                      flexShrink: 0,
                    }}>
                    {/* Toggle pill */}
                    <span style={{
                      width: "28px", height: "16px", borderRadius: "8px",
                      background: sound ? "#5EEAD4" : "rgba(255,255,255,0.18)",
                      position: "relative", flexShrink: 0,
                      transition: "background 150ms",
                    }}>
                      <span style={{
                        position: "absolute", top: "2px",
                        left: sound ? "14px" : "2px",
                        width: "12px", height: "12px", borderRadius: "50%",
                        background: sound ? "#1e1040" : "#ffffff",
                        transition: "left 150ms",
                      }} />
                    </span>
                    Sound
                  </button>
                )}

                {/* Veo mode toggle (frames vs references) */}
                {isVideo && (modelId === "veo3" || modelId === "veo3_fast") && (
                  <button
                    onClick={() => setVeoMode(m => m === "frames" ? "references" : "frames")}
                    disabled={submitting}
                    style={{
                      display: "flex", alignItems: "center", gap: "7px",
                      height: "36px", padding: "0 12px",
                      borderRadius: "8px",
                      border: "1px solid rgba(255,255,255,0.1)",
                      background: veoMode === "references" ? "rgba(251,146,60,0.12)" : "rgba(255,255,255,0.05)",
                      color: veoMode === "references" ? "#fb923c" : "rgba(255,255,255,0.55)",
                      fontSize: "13px", fontFamily: "inherit",
                      cursor: submitting ? "not-allowed" : "pointer",
                      transition: "background 150ms, color 150ms, border-color 150ms",
                      flexShrink: 0,
                    }}>
                    <span style={{
                      width: "28px", height: "16px", borderRadius: "8px",
                      background: veoMode === "references" ? "#fb923c" : "rgba(255,255,255,0.18)",
                      position: "relative", flexShrink: 0,
                      transition: "background 150ms",
                    }}>
                      <span style={{
                        position: "absolute", top: "2px",
                        left: veoMode === "references" ? "14px" : "2px",
                        width: "12px", height: "12px", borderRadius: "50%",
                        background: veoMode === "references" ? "#401010" : "#ffffff",
                        transition: "left 150ms",
                      }} />
                    </span>
                    {veoMode === "references" ? "References" : "Frames"}
                  </button>
                )}

                {/* Seed (video, models that support it) */}
                {isVideo && vidModel?.supportsSeeds && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    height: "36px", padding: "0 11px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(255,255,255,0.05)",
                    flexShrink: 0,
                  }}>
                    <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)", userSelect: "none", whiteSpace: "nowrap" }}>Seed</span>
                    <input
                      type="number"
                      min={0}
                      max={2147483647}
                      placeholder="—"
                      value={seed ?? 0}
                      onChange={(e) => setSeed(e.target.value === "" ? 0 : Math.max(0, Math.min(2147483647, parseInt(e.target.value, 10))))}
                      disabled={submitting}
                      className="seed-input"
                      style={{
                        width: "72px", background: "transparent", border: "none", outline: "none",
                        color: "#fff", fontSize: "12px", fontFamily: "inherit",
                        textAlign: "right", fontVariantNumeric: "tabular-nums",
                        cursor: submitting ? "not-allowed" : "text",
                        MozAppearance: "textfield", appearance: "textfield",
                      }}
                    />
                  </div>
                )}

                {/* Count stepper (image only, hidden in multi-prompt mode) */}
                {!isVideo && !multiPromptMode && (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    height: "36px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(255,255,255,0.05)",
                    overflow: "hidden",
                    flexShrink: 0,
                  }}>
                    <button
                      onClick={() => setCount(c => Math.max(1, c - 1))}
                      disabled={submitting || count <= 1}
                      style={{
                        width: "34px", height: "100%", border: "none", background: "transparent",
                        color: count <= 1 ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.55)",
                        cursor: submitting || count <= 1 ? "not-allowed" : "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "16px", fontFamily: "inherit", transition: "color 140ms",
                      }}
                    >−</button>
                    <span style={{
                      fontSize: "12.5px", color: "#ffffff",
                      minWidth: "30px", textAlign: "center",
                      fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em",
                    }}>
                      {count}/4
                    </span>
                    <button
                      onClick={() => setCount(c => Math.min(4, c + 1))}
                      disabled={submitting || count >= 4}
                      style={{
                        width: "34px", height: "100%", border: "none", background: "transparent",
                        color: count >= 4 ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.55)",
                        cursor: submitting || count >= 4 ? "not-allowed" : "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "16px", fontFamily: "inherit", transition: "color 140ms",
                      }}
                    >+</button>
                  </div>
                )}

                {/* Multi-prompt toggle */}
                <button
                  onClick={() => {
                    setMultiPromptMode(m => {
                      if (m) {
                        // switching OFF — resize the single textarea once it's visible again
                        requestAnimationFrame(() => {
                          if (inputRef.current) resizeTextarea(inputRef.current);
                        });
                      }
                      return !m;
                    });
                    setExpandedPromptIdx(null);
                  }}
                  disabled={submitting}
                  style={{
                    display: "flex", alignItems: "center", gap: "7px",
                    height: "36px", padding: "0 12px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: multiPromptMode ? "rgba(45,212,191,0.12)" : "rgba(255,255,255,0.05)",
                    color: multiPromptMode ? "#2DD4BF" : "rgba(255,255,255,0.55)",
                    fontSize: "13px", fontFamily: "inherit",
                    cursor: submitting ? "not-allowed" : "pointer",
                    transition: "background 150ms, color 150ms",
                    flexShrink: 0,
                  }}>
                  <span style={{
                    width: "28px", height: "16px", borderRadius: "8px",
                    background: multiPromptMode ? "#2DD4BF" : "rgba(255,255,255,0.18)",
                    position: "relative", flexShrink: 0,
                    transition: "background 150ms",
                  }}>
                    <span style={{
                      position: "absolute", top: "2px",
                      left: multiPromptMode ? "14px" : "2px",
                      width: "12px", height: "12px", borderRadius: "50%",
                      background: multiPromptMode ? "#0B3B38" : "#ffffff",
                      transition: "left 150ms",
                    }} />
                  </span>
                  Multi
                </button>

                {/* Text / JSON / YAML mode toggle */}
                <button
                  onClick={() => {
                    if (promptTextMode !== "text") {
                      setPromptTextMode("text");
                    } else {
                      // Auto-detect format
                      try {
                        const formatted = JSON.stringify(JSON.parse(prompt), null, 2);
                        setPrompt(formatted);
                        requestAnimationFrame(() => { if (inputRef.current) resizeTextarea(inputRef.current); });
                        setPromptTextMode("json");
                      } catch {
                        // Not JSON — check for YAML patterns
                        const looksLikeYaml = /^(\s*[\w\-./]+\s*:|---|\s*-\s)/m.test(prompt);
                        setPromptTextMode(looksLikeYaml ? "yaml" : "json");
                      }
                    }
                  }}
                  disabled={submitting}
                  style={{
                    display: "flex", alignItems: "center", gap: "7px",
                    height: "36px", padding: "0 12px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: promptTextMode !== "text" ? "rgba(45,212,191,0.12)" : "rgba(255,255,255,0.05)",
                    color: promptTextMode !== "text" ? "#2DD4BF" : "rgba(255,255,255,0.55)",
                    fontSize: "13px", fontFamily: "inherit",
                    cursor: submitting ? "not-allowed" : "pointer",
                    transition: "background 150ms, color 150ms, border-color 150ms",
                    flexShrink: 0,
                  }}>
                  <span style={{
                    width: "28px", height: "16px", borderRadius: "8px",
                    background: promptTextMode !== "text" ? "#2DD4BF" : "rgba(255,255,255,0.18)",
                    position: "relative", flexShrink: 0,
                    transition: "background 150ms",
                  }}>
                    <span style={{
                      position: "absolute", top: "2px",
                      left: promptTextMode !== "text" ? "14px" : "2px",
                      width: "12px", height: "12px", borderRadius: "50%",
                      background: promptTextMode !== "text" ? "#0B3B38" : "#ffffff",
                      transition: "left 150ms",
                    }} />
                  </span>
                  JSON/YAML
                </button>
              </div>{/* end controls group */}

              {/* Character count + Generate button */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                {promptMaxLength !== null && !multiPromptMode && (
                  <div
                    aria-hidden
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                      color: promptOverLimit ? "#f87171" : "rgba(255,255,255,0.3)",
                      pointerEvents: "none",
                      userSelect: "none",
                    }}
                  >
                    {prompt.length.toLocaleString()}/{promptMaxLength.toLocaleString()}
                  </div>
                )}

                <Button
                  onClick={generate}
                  disabled={!canGenerate}
                  variant="outline"
                  size="sm"
                  className="border-none bg-[rgba(45,212,191,0.25)] text-[rgba(45,212,191,0.9)] hover:bg-[rgba(45,212,191,0.38)] hover:text-[rgba(45,212,191,0.9)] disabled:bg-[rgba(45,212,191,0.1)] disabled:text-[rgba(45,212,191,0.3)]"
                >
                  {submitting ? (
                    <span style={{
                      width: "11px", height: "11px", borderRadius: "50%",
                      border: "2px solid rgba(45,212,191,0.25)", borderTopColor: "rgba(45,212,191,0.9)",
                      display: "inline-block", animation: "spin 0.75s linear infinite",
                    }} />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-icon="inline-start">
                      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
                      <path d="m21.854 2.147-10.94 10.939" />
                    </svg>
                  )}
                  {!submitting && (
                    <KbdGroup data-icon="inline-end" className="gap-0.5">
                      <Kbd>⌘</Kbd>
                      <Kbd>↵</Kbd>
                    </KbdGroup>
                  )}
                </Button>
              </div>
            </div>{/* end bottom row */}
          </div>
        </div>
      </div>

      <style>{GALLERY_CSS}</style>

      {/* ── @ image picker menu ── */}
      {atMenuOpen && promptBarRef.current && createPortal(
        <div
          data-at-menu=""
          style={{
            position: "fixed",
            left: promptBarRef.current.getBoundingClientRect().left,
            bottom: Math.max(8, window.innerHeight - promptBarRef.current.getBoundingClientRect().top + 6),
            width: promptBarRef.current.getBoundingClientRect().width,
            maxHeight: `${promptBarRef.current.getBoundingClientRect().top - 16}px`,
            background: "#0E1012",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "14px",
            boxShadow: "0 8px 48px rgba(0,0,0,0.75), 0 2px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            zIndex: 9999,
            animation: "dropIn 130ms cubic-bezier(0.16,1,0.3,1)",
          }}
          onMouseDown={e => e.preventDefault()}
        >
          <div style={{ padding: "6px 12px 4px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
            <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.28)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>
              {isVideo ? "Reference assets" : "Gallery images"}
            </span>
          </div>
          <div style={{ maxHeight: "280px", overflowY: "auto", padding: "4px", flex: 1, minHeight: 0 }}>
            {filteredMentions.map((ref, idx) => (
              <button
                key={ref.id}
                onClick={() => insertMention(ref)}
                onMouseEnter={() => setMentionSelIdx(idx)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  width: "100%",
                  padding: "7px 10px",
                  borderRadius: "9px",
                  border: "none",
                  background: idx === mentionSelIdx ? "rgba(119,229,68,0.07)" : "transparent",
                  color: idx === mentionSelIdx ? "#2DD4BF" : "rgba(255,255,255,0.65)",
                  fontSize: "13px",
                  fontFamily: "inherit",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 80ms",
                  letterSpacing: "-0.01em",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbSrc(ref.objectUrl, snapWidth(128))}
                  alt=""
                  style={{ width: "30px", height: "30px", borderRadius: "6px", objectFit: "cover", flexShrink: 0, background: "#1a1c1f" }}
                />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ref.role} ({ref.label})
                </span>

                {idx === mentionSelIdx && (
                  <span style={{ marginLeft: "auto", fontSize: "10px", color: "rgba(255,255,255,0.2)", flexShrink: 0 }}>↵</span>
                )}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}

      {/* ── Chip hover preview ── */}
      {chipPreview && createPortal(
        /* Outer: positioning only — no animation so transform stays stable */
        <div
          style={{
            position: "fixed",
            left: Math.max(110, Math.min(
              chipPreview.rect.left + chipPreview.rect.width / 2,
              window.innerWidth - 110,
            )),
            ...(chipPreview.rect.top > 190
              ? { bottom: window.innerHeight - chipPreview.rect.top + 8 }
              : { top: chipPreview.rect.bottom + 8 }),
            transform: "translateX(-50%)",
            zIndex: 99999,
            pointerEvents: "none",
          }}
        >
          {/* Inner: animation + scroll so popup never overflows viewport */}
          <div
            style={{
              borderRadius: "10px",
              overflowY: "auto",
              overflowX: "hidden",
              boxShadow: "0 8px 32px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.4)",
              border: "1px solid rgba(255,255,255,0.08)",
              animation: "dropIn 140ms cubic-bezier(0.16,1,0.3,1)",
              maxHeight: chipPreview.rect.top > 190
                ? `${Math.min(200, chipPreview.rect.top - 16)}px`
                : `${Math.min(200, window.innerHeight - chipPreview.rect.bottom - 16)}px`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbSrc(chipPreview.tag.url, snapWidth(256))}
              alt=""
              style={{ display: "block", maxWidth: "200px", maxHeight: "160px", width: "auto", height: "auto", objectFit: "contain" }}
            />
          </div>
        </div>,
        document.body,
      )}

      {lightboxItem && (() => {
        const idx = orderedGalleryItems.findIndex(i => i.id === lightboxItem.id);
        return (
          <Lightbox
            item={lightboxItem}
            thumbUrl={lightboxThumb}
            onClose={() => setLightboxItem(null)}
            onCopyPrompt={handleCopyPrompt}
            onPrev={idx > 0 ? () => {
              const prev = orderedGalleryItems[idx - 1];
              setLightboxItem(prev);
              setLightboxThumb(thumbSrc(prev.imageUrls?.[0] ?? prev.url, snapWidth(300)));
            } : undefined}
            onNext={idx < orderedGalleryItems.length - 1 ? () => {
              const next = orderedGalleryItems[idx + 1];
              setLightboxItem(next);
              setLightboxThumb(thumbSrc(next.imageUrls?.[0] ?? next.url, snapWidth(300)));
            } : undefined}
          />
        );
      })()}

      {/* Ref media preview modal */}
      {refPreview && (
        <div
          data-prompt-overlay=""
          onClick={() => setRefPreview(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 99000,
            background: "rgba(0,0,0,0.82)",
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "fadeIn 150ms ease",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: "relative",
              maxWidth: "90vw", maxHeight: "90vh",
              borderRadius: "12px", overflow: "hidden",
              boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
              animation: "dropIn 160ms cubic-bezier(0.16,1,0.3,1)",
            }}
          >
            {refPreview.mediaKind === "video" ? (
              <video
                src={refPreview.url}
                controls
                autoPlay
                style={{ display: "block", maxWidth: "90vw", maxHeight: "90vh" }}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={refPreview.url}
                alt=""
                style={{ display: "block", maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain" }}
              />
            )}
            <button
              onClick={() => setRefPreview(null)}
              style={{
                position: "absolute", top: "10px", right: "10px",
                width: "32px", height: "32px", borderRadius: "50%",
                background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.15)",
                color: "rgba(255,255,255,0.9)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: 0,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Duration picker popover — portal so it escapes overflow/transform ancestors */}
      {(durPickerOpen || durPickerClosing) && durPickerPos && createPortal(
        <div
          onMouseDown={e => e.stopPropagation()}
          className={durPickerClosing ? "dur-picker-out" : "dur-picker-in"}
          style={{
            position: "fixed",
            left: durPickerPos.left,
            bottom: durPickerPos.bottom,
            zIndex: 9200,
            background: "rgba(18,20,22,0.98)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "12px",
            padding: "12px 14px",
            boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
            minWidth: "220px",
            transformOrigin: "bottom left",
          }}>
          <p style={{ margin: "0 0 10px", fontSize: "12px", fontWeight: 600, color: "#fff" }}>Duration</p>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", borderRadius: "8px", background: "#141C28" }}>
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)", fontVariantNumeric: "tabular-nums", minWidth: "24px" }}>{duration}s</span>
            <div style={{ width: "1px", height: "14px", background: "#2A2A2A", flexShrink: 0 }} />
            <input
              type="range"
              min={0}
              max={durations.length - 1}
              step={1}
              value={Math.max(0, durations.indexOf(duration))}
              onChange={e => setDuration(durations[parseInt(e.target.value)])}
              className="dur-slider"
              style={{ flex: 1 }}
            />
          </div>
        </div>,
        document.body,
      )}

      <MediaPickerModal
        open={pickerOpen}
        mediaKind={pickerUploadKind}
        onClose={() => setPickerOpen(false)}
        onPickUrl={handlePickerSelect}
        onDeselect={handlePickerDeselect}
        onUpload={handlePickerUpload}
        anchorRef={promptBarRef}
        selectedUrls={
          pickerTarget === "refImage" ? refImages.filter(r => r.cdnUrl).map(r => r.cdnUrl!) :
          pickerTarget === "resource" ? vidResources.filter(r => r.cdnUrl).map(r => r.cdnUrl!) :
          pickerTarget === "referenceVideo" ? vidRefVideos.filter(r => r.cdnUrl).map(r => r.cdnUrl!) :
          undefined
        }
        maxCount={
          pickerTarget === "refImage" ? maxImgs :
          pickerTarget === "resource" ? (vidModel?.maxResources ?? 3) :
          pickerTarget === "referenceVideo" ? (vidModel?.maxReferenceVideos ?? 3) :
          undefined
        }
      />

      <ElementPickerModal
        open={elementPickerOpen}
        attached={vidElements}
        onClose={() => setElementPickerOpen(false)}
        onAttach={el => {
          setVidElements(prev => prev.some(e => e.id === el.id) ? prev : [...prev, el]);
          setElementPickerOpen(false);
        }}
      />

      <DownloadToast downloads={downloads} onClear={() => setDownloads([])} />

      {refError && (
        <div style={{
          position: "fixed",
          top: "64px",
          right: "16px",
          zIndex: 9600,
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 14px",
          borderRadius: "12px",
          background: "rgba(16,18,20,0.97)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(248,113,113,0.25)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.55)",
          fontSize: "13px",
          color: "#f87171",
          fontFamily: "inherit",
          letterSpacing: "-0.01em",
          animation: "dropIn 160ms cubic-bezier(0.16,1,0.3,1)",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
          </svg>
          {refError}
        </div>
      )}

      <QuickAssist />
    </div>
  );
}

export default function GalleryPage() {
  return (
    <Suspense fallback={<div style={{ flex: 1, background: "#0B0E14" }} />}>
      <GalleryInner />
    </Suspense>
  );
}

// ── CustomDropdown ────────────────────────────────────────────────────────────


// ── Element picker modal ─────────────────────────────────────────────────────



// ── AspectRatioDropdown ─────────────────────────────────────────────────────────
// Like CustomDropdown, but for Azure gpt-image-2 it also offers a "Custom…" entry
// that opens an inline width/height subpanel (Azure's popular-sizes + manual entry).




// ── Icons ─────────────────────────────────────────────────────────────────────

/** Backend brand mark for the Kie.ai/Azure Foundry/Codex CLI picker — distinct from ProviderIcon's model-brand icons. */





// ── Gallery card ──────────────────────────────────────────────────────────────


// ── DownloadToast ─────────────────────────────────────────────────────────────


// ── Lightbox helpers ──────────────────────────────────────────────────────────


// ── Lightbox ──────────────────────────────────────────────────────────────────


// ── EmptyState ────────────────────────────────────────────────────────────────






// ── CSS ───────────────────────────────────────────────────────────────────────

