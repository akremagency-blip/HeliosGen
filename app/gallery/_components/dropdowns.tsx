"use client";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AZURE_POPULAR_SIZES, validateAzureCustomSize } from "@/lib/modelConfig";
import { PROVIDERS } from "@/lib/providers";
import { useWorkflowStore } from "@/lib/store";
import { getToken } from "@/lib/galleryUtils";
import {
  DEMO_MODE, loadKlingElements, randomUUID, saveKlingElements,
  type DropOption, type KlingElement,
} from "../_shared";

export function ElementPickerModal({
  open,
  attached,
  onClose,
  onAttach,
}: {
  open: boolean;
  attached: KlingElement[];
  onClose: () => void;
  onAttach: (el: KlingElement) => void;
}) {
  const [view, setView] = useState<"browse" | "create">("browse");
  const [elements, setElements] = useState<KlingElement[]>([]);

  // Create form state
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createImages, setCreateImages] = useState<{ id: string; objectUrl: string; cdnUrl: string | null; uploading: boolean; error: boolean }[]>([]);
  const [creating, setCreating] = useState(false);
  const createFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setView("browse");
    setElements(loadKlingElements());
    setCreateName("");
    setCreateDesc("");
    setCreateImages([]);
    setCreating(false);
  }, [open]);

  if (!open) return null;

  const handleDeleteElement = (id: string) => {
    const updated = elements.filter(e => e.id !== id);
    setElements(updated);
    saveKlingElements(updated);
  };

  const handleCreateImages = async (files: FileList) => {
    const remaining = 4 - createImages.length;
    const toAdd = Array.from(files).slice(0, remaining).filter(
      f => (f.type === "image/jpeg" || f.type === "image/png") && f.size <= 10 * 1024 * 1024
    );
    if (!toAdd.length) return;
    const newEntries = toAdd.map(f => ({
      id: randomUUID(),
      objectUrl: URL.createObjectURL(f),
      cdnUrl: null as string | null,
      uploading: true,
      error: false,
    }));
    setCreateImages(prev => [...prev, ...newEntries]);
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
        setCreateImages(prev => prev.map(e => e.id === entry.id ? { ...e, cdnUrl: data.cdnUrl!, uploading: false } : e));
      } catch {
        setCreateImages(prev => prev.map(e => e.id === entry.id ? { ...e, uploading: false, error: true } : e));
      }
    }));
  };

  const readyImages = createImages.filter(e => e.cdnUrl && !e.error);
  const canCreate = createName.trim().length > 0
    && readyImages.length >= 2
    && !createImages.some(e => e.uploading)
    && !creating;

  const handleCreate = () => {
    if (!canCreate) return;
    setCreating(true);
    const newEl: KlingElement = {
      id: randomUUID(),
      name: createName.trim(),
      description: createDesc.trim(),
      imageUrls: readyImages.map(e => e.cdnUrl!),
    };
    const updated = [...loadKlingElements(), newEl];
    saveKlingElements(updated);
    createImages.forEach(e => URL.revokeObjectURL(e.objectUrl));
    onAttach(newEl);
  };

  return createPortal(
    <div data-prompt-overlay="" style={{ position: "fixed", inset: 0, zIndex: 9100, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
      <div onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "absolute", inset: 0, pointerEvents: "auto" }} />
      <div data-element-picker-modal="" style={{
        position: "relative",
        width: "min(520px, calc(100vw - 32px))",
        maxHeight: "80vh",
        background: "rgba(14,16,18,0.98)",
        border: "1px solid rgba(255,255,255,0.09)",
        borderRadius: "18px",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxShadow: "0 32px 80px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.04)",
        pointerEvents: "auto",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 18px 14px", display: "flex", alignItems: "center", gap: "10px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
          {view === "create" && (
            <button onClick={() => setView("browse")} style={{ width: "28px", height: "28px", borderRadius: "50%", background: "rgba(255,255,255,0.07)", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 120ms" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.13)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
          )}
          <span style={{ fontSize: "14px", fontWeight: 600, color: "#fff", letterSpacing: "-0.01em" }}>
            {view === "browse" ? "Elements" : "New Element"}
          </span>
          <button onClick={onClose} style={{ marginLeft: "auto", width: "28px", height: "28px", borderRadius: "50%", background: "rgba(255,255,255,0.07)", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 120ms" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.13)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {view === "browse" ? (
          /* ── Browse view ── */
          <div className="picker-scroll" style={{ flex: 1, overflowY: "auto", padding: "16px 18px 18px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
              {/* Create new card */}
              <button onClick={() => setView("create")} style={{
                aspectRatio: "1", borderRadius: "10px", border: "1.5px dashed rgba(255,255,255,0.16)",
                background: "rgba(255,255,255,0.025)", cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px",
                color: "rgba(255,255,255,0.5)", transition: "background 150ms, border-color 150ms, color 150ms", padding: 0,
              }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.055)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; e.currentTarget.style.color = "rgba(255,255,255,0.85)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.025)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.16)"; e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(255,255,255,0.09)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                </div>
                <span style={{ fontSize: "11px", fontWeight: 500 }}>New element</span>
              </button>

              {/* Element cards */}
              {elements.map(el => {
                const isAttached = attached.some(a => a.id === el.id);
                const atMax = attached.length >= 3 && !isAttached;
                return (
                  <div key={el.id} style={{ position: "relative", aspectRatio: "1" }}>
                    <button
                      onClick={() => { if (!isAttached && !atMax) onAttach(el); }}
                      disabled={isAttached || atMax}
                      style={{
                        width: "100%", height: "100%", borderRadius: "10px", overflow: "hidden",
                        border: isAttached ? "2px solid #77e544" : "2px solid transparent",
                        background: "#1a1c1f", cursor: isAttached || atMax ? "default" : "pointer",
                        padding: 0, display: "block", position: "relative",
                        transition: "border-color 110ms, opacity 110ms",
                        opacity: atMax ? 0.4 : 1,
                      }}
                      onMouseEnter={e => { if (!isAttached && !atMax) e.currentTarget.style.borderColor = "rgba(255,255,255,0.5)"; }}
                      onMouseLeave={e => { if (!isAttached) e.currentTarget.style.borderColor = "transparent"; }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={el.imageUrls[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      {el.imageUrls.length > 1 && (
                        <div style={{ position: "absolute", top: "5px", left: "5px", background: "rgba(0,0,0,0.65)", borderRadius: "4px", padding: "1px 5px", fontSize: "9px", fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>
                          {el.imageUrls.length}
                        </div>
                      )}
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "14px 6px 5px", background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)" }}>
                        <span style={{ fontSize: "10px", fontWeight: 600, color: "rgba(255,255,255,0.9)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{el.name}</span>
                      </div>
                      {isAttached && (
                        <div style={{ position: "absolute", top: "5px", right: "5px", width: "18px", height: "18px", borderRadius: "50%", background: "#77e544", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                      )}
                    </button>
                    {/* Delete button */}
                    <button onClick={e => { e.stopPropagation(); handleDeleteElement(el.id); }} style={{
                      position: "absolute", bottom: "5px", right: "5px", width: "20px", height: "20px",
                      borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.15)",
                      color: "rgba(255,255,255,0.7)", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", padding: 0, transition: "background 120ms, color 120ms",
                      zIndex: 2,
                    }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(220,40,40,0.85)"; e.currentTarget.style.color = "#fff"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,0,0,0.7)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                );
              })}

              {elements.length === 0 && (
                <div style={{ gridColumn: "1 / -1", padding: "32px 0", textAlign: "center", color: "rgba(255,255,255,0.22)", fontSize: "13px" }}>
                  No elements yet — create your first one
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── Create view ── */
          <div className="picker-scroll" style={{ flex: 1, overflowY: "auto", padding: "16px 18px 18px", display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Images */}
            <div>
              <div style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.4)", marginBottom: "8px" }}>Images (2–4 · JPG/PNG · max 10 MB each)</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" as const }}>
                {createImages.map((img, i) => (
                  <div key={img.id} style={{ position: "relative", width: "72px", height: "72px", borderRadius: "8px", overflow: "hidden", border: img.error ? "1px solid rgba(248,113,113,0.4)" : "1px solid rgba(255,255,255,0.12)", background: "#1a1c1f", flexShrink: 0 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.objectUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    {img.uploading && (
                      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ width: "14px", height: "14px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.15)", borderTopColor: "rgba(255,255,255,0.8)", display: "inline-block", animation: "spin 0.75s linear infinite" }} />
                      </div>
                    )}
                    {img.error && (
                      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
                      </div>
                    )}
                    <button onClick={() => setCreateImages(prev => { URL.revokeObjectURL(img.objectUrl); return prev.filter((_, j) => j !== i); })} style={{
                      position: "absolute", top: "3px", right: "3px", width: "16px", height: "16px",
                      borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "none",
                      color: "rgba(255,255,255,0.85)", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                    }}>
                      <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                ))}
                {createImages.length < 4 && (
                  <button onClick={() => { if (DEMO_MODE) { useWorkflowStore.getState().setAuthModalOpen(true); return; } createFileRef.current?.click(); }} style={{
                    width: "72px", height: "72px", borderRadius: "8px", flexShrink: 0,
                    border: "1.5px dashed rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.025)",
                    cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px",
                    color: "rgba(255,255,255,0.4)", transition: "background 140ms, border-color 140ms, color 140ms",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.055)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; e.currentTarget.style.color = "rgba(255,255,255,0.8)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.025)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                    <span style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.04em" }}>ADD</span>
                  </button>
                )}
              </div>
              <input ref={createFileRef} type="file" accept="image/jpeg,image/png" multiple style={{ display: "none" }}
                onChange={e => { if (e.target.files) { handleCreateImages(e.target.files); e.target.value = ""; } }} />
            </div>

            {/* Name */}
            <div>
              <div style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.4)", marginBottom: "8px" }}>Name</div>
              <input
                value={createName}
                onChange={e => setCreateName(e.target.value)}
                placeholder="Element name"
                maxLength={50}
                style={{
                  width: "100%", padding: "9px 12px", borderRadius: "8px",
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                  color: "#fff", fontSize: "13.5px", fontFamily: "inherit", outline: "none",
                  boxSizing: "border-box" as const,
                }}
              />
            </div>

            {/* Description */}
            <div>
              <div style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.4)", marginBottom: "8px" }}>Description</div>
              <textarea
                value={createDesc}
                onChange={e => setCreateDesc(e.target.value)}
                placeholder="Describe this element…"
                rows={3}
                maxLength={500}
                style={{
                  width: "100%", padding: "9px 12px", borderRadius: "8px",
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                  color: "#fff", fontSize: "13.5px", fontFamily: "inherit", outline: "none",
                  resize: "none", boxSizing: "border-box" as const,
                }}
              />
            </div>

            {/* Create button */}
            <button
              onClick={handleCreate}
              disabled={!canCreate}
              style={{
                padding: "10px 24px", borderRadius: "10px", border: "none",
                background: canCreate ? "#77e544" : "rgba(255,255,255,0.08)",
                color: canCreate ? "#000" : "rgba(255,255,255,0.3)",
                fontSize: "13.5px", fontWeight: 600, fontFamily: "inherit",
                cursor: canCreate ? "pointer" : "not-allowed", transition: "background 150ms, color 150ms",
                alignSelf: "flex-start" as const,
              }}>
              {creating ? "Creating…" : "Create element"}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function CustomDropdown({
  value,
  onChange,
  disabled,
  options,
  icon,
  showChevron = true,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  options: DropOption[];
  icon?: React.ReactNode;
  showChevron?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, bottom: 0, minW: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const selectedOpt = options.find(o => o.value === value);
  const label = selectedOpt?.label ?? value;
  const triggerIcon = selectedOpt?.providerIcon ?? icon;

  const openDrop = () => {
    if (disabled || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPos({ left: r.left, bottom: window.innerHeight - r.top + 6, minW: r.width });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !dropRef.current?.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Group options by group field
  const groups = options.reduce<Record<string, DropOption[]>>((acc, o) => {
    const g = o.group ?? "";
    (acc[g] ??= []).push(o);
    return acc;
  }, {});
  const groupKeys = Object.keys(groups);
  const hasGroups = groupKeys.some(k => k !== "");

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => open ? setOpen(false) : openDrop()}
        disabled={disabled}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          height: "36px",
          padding: "0 12px",
          borderRadius: "8px",
          border: open
            ? "1px solid rgba(255,255,255,0.18)"
            : "1px solid rgba(255,255,255,0.1)",
          background: open
            ? "rgba(255,255,255,0.08)"
            : "rgba(255,255,255,0.05)",
          flexShrink: 0,
          cursor: disabled ? "not-allowed" : "pointer",
          fontFamily: "inherit",
          transition: "border-color 140ms, background 140ms",
          userSelect: "none",
        }}
        onMouseEnter={e => {
          if (!disabled && !open) {
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.16)";
            e.currentTarget.style.background = "rgba(255,255,255,0.07)";
          }
        }}
        onMouseLeave={e => {
          if (!open) {
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
            e.currentTarget.style.background = "rgba(255,255,255,0.05)";
          }
        }}
      >
        {triggerIcon && (
          <span style={{ display: "flex", alignItems: "center", color: selectedOpt?.providerIcon ? "#2DD4BF" : "white", flexShrink: 0 }}>
            {triggerIcon}
          </span>
        )}
        <span style={{ fontSize: "13px", color: "#ffffff", whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>
          {label}
        </span>
        {showChevron && (
          <svg
            width="10" height="10" viewBox="0 0 24 24" fill="none"
            stroke="rgba(255,255,255,0.35)" strokeWidth="2.5" strokeLinecap="round"
            style={{ flexShrink: 0, transition: "transform 140ms", transform: open ? "rotate(180deg)" : "none" }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>

      {open && createPortal(
        <div
          ref={dropRef}
          data-custom-dropdown-portal=""
          style={{
            position: "fixed",
            left: pos.left,
            bottom: pos.bottom,
            minWidth: Math.max(pos.minW, 160),
            background: "#0E1012",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "14px",
            boxShadow: "0 8px 48px rgba(0,0,0,0.75), 0 2px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)",
            overflow: "hidden",
            zIndex: 9999,
            animation: "dropIn 130ms cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          <div style={{ padding: "5px", maxHeight: "300px", overflowY: "auto" }}>
            {hasGroups ? (
              groupKeys.map((gk, gi) => (
                <div key={gk}>
                  {gi > 0 && (
                    <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", margin: "4px 8px" }} />
                  )}
                  {gk && (
                    <div style={{
                      padding: "5px 10px 3px",
                      fontSize: "10px",
                      color: "rgba(255,255,255,0.22)",
                      textTransform: "uppercase",
                      letterSpacing: "0.09em",
                      fontWeight: 500,
                    }}>
                      {gk}
                    </div>
                  )}
                  {groups[gk].map(opt => (
                    <DropItem
                      key={opt.value}
                      label={opt.label}
                      active={opt.value === value}
                      onClick={() => { onChange(opt.value); setOpen(false); }}
                      preview={opt.preview}
                      providerIcon={opt.providerIcon}
                    />
                  ))}
                </div>
              ))
            ) : (
              options.map(opt => (
                <DropItem
                  key={opt.value}
                  label={opt.label}
                  active={opt.value === value}
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  preview={opt.preview}
                  providerIcon={opt.providerIcon}
                />
              ))
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export function AspectRatioDropdown({
  value,
  onChange,
  disabled,
  ratios,
  allowCustom,
  customWidth,
  customHeight,
  onApplyCustom,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  ratios: string[];
  allowCustom: boolean;
  customWidth?: number;
  customHeight?: number;
  onApplyCustom: (w: number, h: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"list" | "custom">("list");
  const [pos, setPos] = useState({ left: 0, bottom: 0, minW: 0 });
  const [widthDraft, setWidthDraft] = useState(1024);
  const [heightDraft, setHeightDraft] = useState(1024);
  const [customError, setCustomError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const label = value === "custom" ? `${customWidth ?? 1024}×${customHeight ?? 1024}` : value;

  const openDrop = () => {
    if (disabled || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPos({ left: r.left, bottom: window.innerHeight - r.top + 6, minW: r.width });
    setView("list");
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !dropRef.current?.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    minWidth: 0,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    padding: "6px 8px",
    fontSize: "12px",
    color: "#ffffff",
    fontFamily: "inherit",
  };

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => open ? setOpen(false) : openDrop()}
        disabled={disabled}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          height: "36px",
          padding: "0 12px",
          borderRadius: "8px",
          border: open ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(255,255,255,0.1)",
          background: open ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.05)",
          flexShrink: 0,
          cursor: disabled ? "not-allowed" : "pointer",
          fontFamily: "inherit",
          transition: "border-color 140ms, background 140ms",
          userSelect: "none",
        }}
        onMouseEnter={e => {
          if (!disabled && !open) {
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.16)";
            e.currentTarget.style.background = "rgba(255,255,255,0.07)";
          }
        }}
        onMouseLeave={e => {
          if (!open) {
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
            e.currentTarget.style.background = "rgba(255,255,255,0.05)";
          }
        }}
      >
        {value !== "custom" && (
          <span style={{ display: "flex", alignItems: "center", color: "white", flexShrink: 0 }}>
            <RatioTriggerPreview ratio={value} />
          </span>
        )}
        <span style={{ fontSize: "13px", color: "#ffffff", whiteSpace: "nowrap", letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums" }}>
          {label}
        </span>
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke="rgba(255,255,255,0.35)" strokeWidth="2.5" strokeLinecap="round"
          style={{ flexShrink: 0, transition: "transform 140ms", transform: open ? "rotate(180deg)" : "none" }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={dropRef}
          data-custom-dropdown-portal=""
          style={{
            position: "fixed",
            left: pos.left,
            bottom: pos.bottom,
            minWidth: view === "custom" ? 240 : Math.max(pos.minW, 160),
            background: "#0E1012",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "14px",
            boxShadow: "0 8px 48px rgba(0,0,0,0.75), 0 2px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)",
            overflow: "hidden",
            zIndex: 9999,
            animation: "dropIn 130ms cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          {view === "list" ? (
            <div style={{ padding: "5px", maxHeight: "300px", overflowY: "auto" }}>
              {ratios.map(r => (
                <DropItem
                  key={r}
                  label={r}
                  active={r === value}
                  onClick={() => { onChange(r); setOpen(false); }}
                  preview={<RatioPreview ratio={r} />}
                />
              ))}
              {allowCustom && (
                <>
                  <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", margin: "4px 8px" }} />
                  <DropItem
                    label="Custom…"
                    active={value === "custom"}
                    onClick={() => {
                      setWidthDraft(customWidth ?? 1024);
                      setHeightDraft(customHeight ?? 1024);
                      setCustomError(null);
                      setView("custom");
                    }}
                  />
                </>
              )}
            </div>
          ) : (
            <div style={{ padding: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <button
                  onClick={() => setView("list")}
                  style={{ display: "flex", alignItems: "center", gap: "4px", background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: "11px", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
                >
                  <span aria-hidden>‹</span> Back
                </button>
                <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>
                  Custom size
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                <input
                  type="number"
                  value={widthDraft}
                  onChange={e => setWidthDraft(Number(e.target.value))}
                  placeholder="Width"
                  style={inputStyle}
                />
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "11px", flexShrink: 0 }}>×</span>
                <input
                  type="number"
                  value={heightDraft}
                  onChange={e => setHeightDraft(Number(e.target.value))}
                  placeholder="Height"
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", marginBottom: "8px" }}>
                {AZURE_POPULAR_SIZES.map(p => (
                  <button
                    key={p.label}
                    onClick={() => { setWidthDraft(p.width); setHeightDraft(p.height); setCustomError(null); }}
                    style={{
                      textAlign: "left",
                      fontSize: "10px",
                      color: "rgba(255,255,255,0.55)",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: "6px",
                      padding: "5px 7px",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.55)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {customError && (
                <div style={{ fontSize: "10px", color: "#f87171", marginBottom: "8px", lineHeight: 1.4 }}>
                  {customError}
                </div>
              )}
              <button
                onClick={() => {
                  const err = validateAzureCustomSize(widthDraft, heightDraft);
                  if (err) { setCustomError(err); return; }
                  onApplyCustom(widthDraft, heightDraft);
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  textAlign: "center",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "#fff",
                  background: "rgba(255,255,255,0.1)",
                  border: "none",
                  borderRadius: "8px",
                  padding: "7px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.16)")}
                onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
              >
                Apply
              </button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

export function DropItem({ label, active, onClick, preview, providerIcon }: { label: string; active: boolean; onClick: () => void; preview?: React.ReactNode; providerIcon?: React.ReactNode }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        width: "100%",
        padding: "7px 10px",
        borderRadius: "9px",
        border: "none",
        background: active
          ? "rgba(255,255,255,0.09)"
          : hovered ? "rgba(255,255,255,0.06)" : "transparent",
        color: active ? "#ffffff" : hovered ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.55)",
        fontSize: "13px",
        fontWeight: active ? 500 : 400,
        cursor: "pointer",
        textAlign: "left",
        transition: "background 100ms, color 100ms",
        fontFamily: "inherit",
        letterSpacing: "-0.01em",
        whiteSpace: "nowrap",
      }}
    >
      {providerIcon && (
        <span style={{ display: "flex", alignItems: "center", color: "#2DD4BF", flexShrink: 0, opacity: active ? 1 : 0.7 }}>
          {providerIcon}
        </span>
      )}
      {preview}
      {label}
    </button>
  );
}

export function RatioPreview({ ratio }: { ratio: string }) {
  const [ws, hs] = ratio.split(":");
  const w = parseFloat(ws), h = parseFloat(hs);
  if (!w || !h) return null;
  const maxW = 36, maxH = 22;
  let rw = maxW, rh = (h / w) * maxW;
  if (rh > maxH) { rh = maxH; rw = (w / h) * maxH; }
  return (
    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "44px", flexShrink: 0 }}>
      <span style={{
        display: "inline-block",
        width: `${Math.round(rw)}px`,
        height: `${Math.round(rh)}px`,
        border: "1.5px solid rgba(255,255,255,0.75)",
        borderRadius: "5px",
        flexShrink: 0,
      }} />
    </span>
  );
}

export function ProviderBackendIcon({ id }: { id: (typeof PROVIDERS)[number]["id"] }) {
  if (id === "kie") {
    return (
      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "14px", height: "14px", fontSize: "11px", fontWeight: 700 }}>
        K
      </span>
    );
  }
  if (id === "codex") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd">
        <path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z" />
      </svg>
    );
  }
  if (id === "azure") {
    return (
      <svg width="14" height="14" viewBox="0 0 256 199">
        <path d="M118.432 187.698c32.89-5.81 60.055-10.618 60.367-10.684l.568-.12l-31.052-36.935c-17.078-20.314-31.051-37.014-31.051-37.11c0-.182 32.063-88.477 32.243-88.792c.06-.105 21.88 37.567 52.893 91.32c29.035 50.323 52.973 91.815 53.195 92.203l.405.707l-98.684-.012l-98.684-.013l59.8-10.564zM0 176.435c0-.052 14.631-25.451 32.514-56.442l32.514-56.347l37.891-31.799C123.76 14.358 140.867.027 140.935.001c.069-.026-.205.664-.609 1.534s-18.919 40.582-41.145 88.25l-40.41 86.67l-29.386.037c-16.162.02-29.385-.005-29.385-.057z" fill="#0089D6" fillRule="nonzero" />
      </svg>
    );
  }
  return null;
}

export function ProviderIcon({ provider }: { provider: string }) {
  switch (provider) {
    case "OpenAI":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path fillRule="evenodd" clipRule="evenodd" d="M22.408 9.80741C22.9487 8.17778 22.7685 6.37037 21.8974 4.88889C20.5758 2.60741 17.9024 1.45185 15.2891 1.98519C14.1477 0.711111 12.4656 0 10.7234 0C8.0501 0 5.70717 1.68889 4.86612 4.17778C3.15398 4.53333 1.68214 5.57037 0.811051 7.08148C-0.510601 9.36296 -0.210226 12.2074 1.56199 14.163C1.02131 15.8222 1.23158 17.6 2.10267 19.0815C3.42432 21.363 6.09766 22.5481 8.71093 21.9852C9.88239 23.2593 11.5345 24 13.2766 24C15.95 24 18.2929 22.3111 19.134 19.8222C20.8461 19.4667 22.3179 18.4296 23.189 16.9185C24.5107 14.637 24.2103 11.763 22.408 9.80741ZM13.2766 22.4296C12.1953 22.4296 11.174 22.0741 10.363 21.3926C10.393 21.363 10.4831 21.3333 10.5132 21.3037L15.3492 18.5481C15.5895 18.4 15.7397 18.163 15.7397 17.8667V11.1407L17.7823 12.2963C17.8123 12.2963 17.8123 12.3259 17.8123 12.3556V17.9259C17.8423 20.4148 15.7998 22.4296 13.2766 22.4296ZM3.48439 18.3111C2.94372 17.3926 2.76349 16.3259 2.94372 15.2889C2.97375 15.3185 3.03383 15.3481 3.0939 15.3778L7.92995 18.1333C8.17025 18.2815 8.47063 18.2815 8.71093 18.1333L14.6283 14.7556V17.0963C14.6283 17.1259 14.6283 17.1556 14.5983 17.1556L9.70216 19.9407C7.53946 21.1852 4.74597 20.4444 3.48439 18.3111ZM2.22282 7.88148C2.76349 6.96296 3.60454 6.28148 4.59578 5.8963V11.5852C4.59578 11.8519 4.74597 12.1185 4.98627 12.2667L10.9037 15.6444L8.86111 16.8C8.83108 16.8 8.80104 16.8296 8.80104 16.8L3.90492 14.0148C1.68214 12.7704 0.961239 10.0148 2.22282 7.88148ZM19.0438 11.7333L13.1264 8.35556L15.169 7.2C15.199 7.2 15.2291 7.17037 15.2291 7.2L20.1252 9.98519C22.3179 11.2296 23.0388 13.9852 21.7773 16.1185C21.2366 17.037 20.3955 17.7185 19.4043 18.0741V12.4148C19.4343 12.1481 19.2841 11.8815 19.0438 11.7333ZM21.0564 8.71111C21.0263 8.68148 20.9662 8.65185 20.9062 8.62222L16.0701 5.86667C15.8298 5.71852 15.5294 5.71852 15.2891 5.86667L9.37175 9.24444V6.9037C9.37175 6.87407 9.37175 6.84444 9.40179 6.84444L14.2979 4.05926C16.4906 2.81481 19.2541 3.55556 20.5157 5.71852C21.0564 6.60741 21.2366 7.67407 21.0564 8.71111ZM8.26036 12.8593L6.21781 11.7037C6.18777 11.7037 6.18777 11.6741 6.18777 11.6444V6.07407C6.18777 3.58519 8.23032 1.57037 10.7535 1.57037C11.8348 1.57037 12.8561 1.92593 13.6671 2.60741C13.6371 2.63704 13.577 2.66667 13.5169 2.6963L8.68089 5.45185C8.44059 5.6 8.2904 5.83704 8.2904 6.13333V12.8593H8.26036ZM9.37175 10.4889L12.0151 8.97778L14.6584 10.4889V13.4815L12.0151 14.9926L9.37175 13.4815V10.4889Z" />
        </svg>
      );
    case "Google":
      return (
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
          <path d="M2.55464 6.25768C3.24798 4.87705 4.31161 3.71644 5.62666 2.90557C6.94171 2.0947 8.45636 1.66553 10.0013 1.66602C12.2471 1.66602 14.1338 2.49102 15.5763 3.83685L13.1871 6.22685C12.323 5.40102 11.2246 4.98018 10.0013 4.98018C7.83047 4.98018 5.99297 6.44685 5.3388 8.41602C5.17214 8.91602 5.07714 9.44935 5.07714 9.99935C5.07714 10.5493 5.17214 11.0827 5.3388 11.5827C5.9938 13.5527 7.83047 15.0185 10.0013 15.0185C11.1221 15.0185 12.0763 14.7227 12.823 14.2227C13.2558 13.9377 13.6264 13.5679 13.9123 13.1356C14.1982 12.7033 14.3935 12.2176 14.4863 11.7077H10.0013V8.48435H17.8496C17.948 9.02935 18.0013 9.59768 18.0013 10.1885C18.0013 12.7268 17.093 14.8635 15.5163 16.3135C14.138 17.5868 12.2513 18.3327 10.0013 18.3327C8.90683 18.3331 7.823 18.1179 6.81176 17.6992C5.80051 17.2806 4.88168 16.6668 4.10777 15.8929C3.33386 15.119 2.72005 14.2001 2.30141 13.1889C1.88278 12.1777 1.66753 11.0938 1.66797 9.99935C1.66797 8.65435 1.98964 7.38268 2.55464 6.25768Z" />
        </svg>
      );
    case "Seedream":
      return (
        <svg width="16" height="16" viewBox="0 0 14 14" fill="currentColor">
          <path d="M2.7601 10.635L0.466553 11.2084V1.04883L2.7601 1.62222V10.635Z" />
          <path d="M13.8448 11.2295L11.5469 11.8029V0.454102L13.8448 1.02324V11.2295Z" />
          <path d="M6.39853 10.9452L4.10498 11.5186V5.53418L6.39853 6.10752V10.9452Z" />
          <path d="M7.89722 4.64663L10.1952 4.07324V10.0577L7.89722 9.48433V4.64663Z" />
        </svg>
      );
    case "Z-AI":
      return (
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
          <path d="M19.9361 12.1411L17.6243 8.09523L17.3525 7.61735L18.5771 5.47657C18.6187 5.4023 18.6411 5.32158 18.6411 5.23763C18.6411 5.15367 18.6187 5.07295 18.5771 4.99868L17.215 2.61896C17.1735 2.5447 17.1127 2.48658 17.0424 2.4446C16.972 2.40262 16.8921 2.38002 16.8058 2.38002H11.6323L10.4077 0.236011C10.3245 0.0874804 10.1679 -0.00292969 9.9984 -0.00292969H7.27738C7.19425 -0.00292969 7.11111 0.0196728 7.04077 0.0616489C6.97042 0.103625 6.90967 0.161746 6.86811 0.236011L4.55316 4.28509L4.28138 4.75974H1.83213C1.749 4.75974 1.66587 4.78235 1.59552 4.82432C1.52518 4.8663 1.46443 4.92442 1.42286 4.99868L0.0639488 7.38164C0.0223821 7.4559 0 7.53663 0 7.62058C0 7.70453 0.0223821 7.78525 0.0639488 7.85952L2.65068 12.3833L1.42606 14.5273C1.38449 14.6015 1.36211 14.6823 1.36211 14.7662C1.36211 14.8502 1.38449 14.9309 1.42606 15.0051L2.78817 17.3849C2.82974 17.4591 2.89049 17.5173 2.96083 17.5592C3.03118 17.6012 3.11111 17.6238 3.19744 17.6238H8.36771L9.59233 19.7678C9.67546 19.9163 9.83214 20.0068 10.0016 20.0068H12.7226C12.8058 20.0068 12.8889 19.9842 12.9592 19.9422C13.0296 19.9002 13.0903 19.8421 13.1319 19.7678L15.7186 15.2441H18.1679C18.251 15.2441 18.3341 15.2215 18.4045 15.1795C18.4748 15.1375 18.5356 15.0794 18.5771 15.0051L19.9393 12.6254C19.9808 12.5512 20.0032 12.4704 20.0032 12.3865C20.0032 12.3025 19.9808 12.2218 19.9393 12.1475L19.9361 12.1411ZM7.27738 0.474952L8.63949 2.8579L7.27738 5.23763H18.1679L16.8058 7.61735H6.45883L4.82494 4.75974L7.27738 0.474952ZM8.09273 17.1395H3.19424L4.55636 14.7565H7.27738L1.83213 5.23763H4.55316L5.91527 7.61735L9.72662 14.2851L8.09273 17.1427V17.1395ZM16.8058 12.3768L15.4468 9.99707L10.0016 19.5224L8.63949 17.1427L10.0016 14.763L13.813 8.09523H17.0807L19.53 12.38H16.8058V12.3768Z" />
        </svg>
      );
    case "X":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M9.23842 15.4055L17.3051 9.26292C17.7006 8.9618 18.2658 9.07925 18.4543 9.54702C19.446 12.0138 19.0029 14.9784 17.0297 17.0138C15.0566 19.0492 12.3111 19.4955 9.80163 18.4789L7.06027 19.7882C10.9922 22.5604 15.7667 21.8748 18.7504 18.795C21.117 16.3538 21.8499 13.0262 21.1646 10.0254L21.1708 10.0318C20.1769 5.62354 21.4151 3.86151 23.9515 0.258408C23.9702 0.231693 23.9351 0.202703 23.9123 0.226139L20.7939 3.44289V3.43221L9.23842 15.4055Z" />
          <path d="M7.65167 7.33217C5.24368 9.81392 4.75711 14.1176 7.57924 16.8984L7.57713 16.9005L0.0792788 23.8097C0.0528384 23.834 0.0162235 23.8015 0.0377551 23.7728C0.487937 23.1707 1.01883 22.595 1.54932 22.0198L1.57777 21.9889C3.28214 20.1411 4.97141 18.3097 3.93926 15.7216C2.55615 12.2552 3.36158 8.19287 5.9228 5.55089C8.58547 2.80639 12.507 2.1144 15.7826 3.5048C16.5072 3.78245 17.1388 4.17758 17.6315 4.54493L14.8964 5.84777C12.3497 4.7457 9.43229 5.49537 7.65167 7.33217Z" />
        </svg>
      );
    case "Kling":
      return (
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" clipRule="evenodd" d="M16.7522 2.86984L16.818 2.93745L16.8199 2.93552C18.087 4.25441 17.7236 6.90443 15.8863 9.90864L19.5 13.6567L19.3447 13.9703C18.7372 15.1986 17.9147 16.2992 16.9193 17.216C15.608 18.43 14.0251 19.2853 12.3143 19.7044L12.2522 19.7198L12.1634 19.7417L12.0994 19.7565L11.9584 19.7887L11.8416 19.8126L11.754 19.8299C11.6609 19.8493 11.5634 19.8673 11.4683 19.884L11.3888 19.8963L11.3286 19.904C11.2429 19.916 11.1576 19.9272 11.0727 19.9375C9.64831 20.1036 8.20616 19.9376 6.8516 19.4517C5.49703 18.9658 4.2643 18.1723 3.24348 17.1291L3.18385 17.0692C1.91429 15.7503 2.27391 13.0983 4.11366 10.0922L0.5 6.34416L0.65528 6.03054C1.26118 4.80131 2.0846 3.70115 3.08261 2.78741C4.10242 1.8473 5.28649 1.11848 6.57081 0.640344C6.86894 0.528933 7.18075 0.431691 7.48696 0.34926C7.73931 0.279139 7.9944 0.220054 8.25155 0.172163C8.33851 0.154131 8.43665 0.135456 8.53168 0.118712C10.0139 -0.12084 11.5297 0.00325476 12.9574 0.481036C14.385 0.958817 15.6847 1.77698 16.7522 2.86984ZM15.5304 3.03083H15.5267L15.5304 3.03276C14.3025 2.63864 12.354 3.27555 10.2944 4.68267C11.8615 4.22994 13.377 4.46435 14.3565 5.48057C15.2845 6.44462 15.5385 7.90777 15.187 9.44497C15.1704 9.52697 15.1497 9.61005 15.1248 9.69419C16.8062 7.05706 17.3441 4.58993 16.2795 3.48807C16.262 3.4682 16.2433 3.44949 16.2236 3.43204L16.2155 3.42431L16.2037 3.41336L16.1683 3.38503C16.153 3.37215 16.1371 3.3597 16.1205 3.34768L16.0944 3.32836C15.9242 3.19657 15.7334 3.09594 15.5304 3.03083ZM14.6876 8.95876C14.4708 10.2995 13.7559 11.6545 12.672 12.777C11.5913 13.9001 10.282 14.642 8.98696 14.8687C7.77516 15.0812 6.72981 14.8043 6.04472 14.0959C5.36149 13.3868 5.09441 12.3069 5.29938 11.044C5.51615 9.7045 6.22919 8.3489 7.30807 7.22771C7.30807 7.22771 7.30994 7.22771 7.31429 7.22127L7.31801 7.21483C8.40062 6.09944 9.70497 5.3595 10.9969 5.13539C12.2087 4.92287 13.2516 5.1985 13.9391 5.90818C14.6224 6.61657 14.8894 7.69847 14.6845 8.9594H14.6882L14.6876 8.95876ZM3.70621 3.51061C2.88113 4.26712 2.1865 5.16395 1.65217 6.16255L1.64596 6.16449L4.78137 9.40762C5.04127 9.02837 5.31475 8.65932 5.60124 8.30124C5.70311 8.17567 5.80807 8.04558 5.91553 7.91614L5.95652 7.86784L6.10559 7.69525C6.10994 7.69139 6.11429 7.68301 6.11429 7.68301L6.14161 7.65082L6.1559 7.63343L6.23292 7.54456C6.27226 7.49819 6.31284 7.45247 6.35466 7.40739C6.35466 7.40288 6.36087 7.39644 6.36087 7.39644L6.42795 7.32045L6.47578 7.26893C6.47785 7.26592 6.4795 7.26507 6.4795 7.26507C6.48385 7.26249 6.48385 7.25863 6.48385 7.25863C6.48675 7.25562 6.48965 7.25176 6.49255 7.24703L6.50124 7.23609C6.50882 7.23006 6.51569 7.22314 6.52174 7.21548L6.53354 7.2026C6.55901 7.17619 6.58944 7.14528 6.61677 7.11437C6.63126 7.09591 6.64783 7.07745 6.66646 7.05899L6.69193 7.03194C6.69627 7.0255 6.70807 7.01326 6.70807 7.01326L6.7559 6.96432L6.84907 6.86901L6.88012 6.83488L6.91491 6.79688C7.5863 6.09838 8.30377 5.44917 9.06211 4.85397L9.16149 4.77862H9.16211V4.77798L9.16335 4.77733L9.26273 4.70134C9.37371 4.61505 9.48551 4.53068 9.59814 4.44825C9.71822 4.36325 9.8383 4.27953 9.95838 4.1971C11.587 3.0714 13.182 2.39586 14.4839 2.26191C12.7422 1.17239 10.6864 0.752921 8.6764 1.07697C8.58944 1.09114 8.50621 1.10595 8.41677 1.12462C8.36025 1.13493 8.31118 1.14523 8.26149 1.15554L8.23168 1.16198C7.77515 1.25942 7.3258 1.39004 6.88696 1.55288C5.71551 1.9877 4.63519 2.65238 3.70621 3.51061ZM3.87888 16.6531C4.05279 16.7905 4.25093 16.8949 4.47329 16.9661H4.46894C5.70497 17.3577 7.64596 16.7188 9.69814 15.3156C8.13292 15.7664 6.6205 15.532 5.64099 14.5157C4.71739 13.5562 4.46335 12.0885 4.81304 10.5513C4.83043 10.4693 4.85093 10.3863 4.87453 10.3021C3.19379 12.9399 2.65714 15.4064 3.7205 16.5089C3.77062 16.56 3.8235 16.6082 3.87888 16.6531ZM18.346 13.8389V13.8402C17.8108 14.8373 17.1168 15.7333 16.2932 16.4902C15.0606 17.625 13.5707 18.4173 11.9627 18.7931L11.9429 18.7983L11.8894 18.8112C11.8291 18.8281 11.7679 18.8418 11.7062 18.8524C11.666 18.8614 11.6251 18.8693 11.5832 18.8762C11.4967 18.8936 11.4097 18.9087 11.3224 18.9213L11.2497 18.9342L11.1671 18.9451C11.1008 18.9545 11.0329 18.9631 10.9634 18.9709C9.06697 19.1922 7.15308 18.7592 5.51801 17.7389C6.77143 17.6108 8.29752 16.9764 9.86273 15.9274L9.95217 15.8668L10.0416 15.8057L10.1634 15.7206H10.164L10.3994 15.5545C10.5128 15.4721 10.6246 15.3877 10.7348 15.3014C10.8035 15.2503 10.871 15.1994 10.9373 15.1488C11.6946 14.5518 12.4122 13.9025 13.0851 13.2052C13.1012 13.1881 13.1164 13.1713 13.1304 13.155L13.1491 13.1331C13.1822 13.1009 13.2133 13.0693 13.2422 13.0384L13.2894 12.9895C13.2894 12.9895 13.3019 12.9766 13.3037 12.9702L13.3217 12.9521L13.3292 12.9438L13.3832 12.8884L13.4248 12.8433C13.4389 12.8296 13.4528 12.815 13.4665 12.7995L13.4776 12.7866C13.4837 12.7792 13.4906 12.7725 13.4981 12.7667L13.5075 12.7551L13.5161 12.7441C13.5161 12.7441 13.5224 12.7377 13.5261 12.7358L13.5429 12.7171L13.5596 12.6984L13.5758 12.6823C13.5584 12.7012 13.5418 12.7209 13.5261 12.7416L13.5646 12.6997L13.5652 12.6984C13.5921 12.6684 13.6188 12.6396 13.6453 12.6121C13.6453 12.6121 13.6453 12.6057 13.6516 12.6057C13.688 12.5653 13.7234 12.5245 13.7578 12.4833L13.828 12.4022C13.8372 12.396 13.8447 12.3873 13.8497 12.3771L13.8894 12.3275L13.8994 12.3152C13.9478 12.2616 13.9952 12.2073 14.0416 12.1523L14.0901 12.0943C14.1679 12.0003 14.2453 11.9057 14.3224 11.8103L14.4155 11.6951L14.4447 11.6577C14.482 11.6092 14.5188 11.562 14.5553 11.516C14.5863 11.4774 14.6168 11.4379 14.6466 11.3975C14.8451 11.1367 15.0377 10.8711 15.2242 10.6009L18.346 13.8389ZM18.346 13.8389C18.346 13.8368 18.3472 13.835 18.3497 13.8338V13.8441L18.346 13.8402H18.3472L18.346 13.8389Z" />
        </svg>
      );
    case "Bytedance":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <g clipPath="url(#seedance-clip)">
            <path d="M3.1544 12.1539L0.533203 12.8092V1.19824L3.1544 1.85354V12.1539Z" />
            <path d="M15.8225 12.8333L13.1963 13.4886V0.518555L15.8225 1.169V12.8333Z" />
            <path d="M7.31261 12.5083L4.69141 13.1636V6.32422L7.31261 6.97947V12.5083Z" />
            <path d="M9.02539 5.3096L11.6516 4.6543V11.4937L9.02539 10.8384V5.3096Z" />
          </g>
          <defs>
            <clipPath id="seedance-clip">
              <rect width="16" height="14" fill="white" />
            </clipPath>
          </defs>
        </svg>
      );
    case "Alibaba":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M9.39589 9.99064C10.2791 8.81304 11.9431 7.16184 11.9943 5.99704C12.0967 4.48664 10.5735 3.98744 8.99909 4.00024C7.89829 4.01304 6.77189 4.33304 6.00389 4.60184C3.32869 5.54904 1.66469 7.04664 0.60229 8.72344C-0.51131 10.3746 -0.14011 11.949 2.21509 12.0002C4.01989 11.9234 5.19749 11.4242 6.42629 10.797C6.43909 10.797 3.03429 11.7698 1.79269 11.053C1.66469 10.9762 1.52389 10.8738 1.48549 10.5922C1.47269 10.0034 2.45829 9.38904 3.00869 9.19704V8.17304C3.41829 8.32664 3.85349 8.41624 4.31429 8.41624C5.19749 8.41624 6.00389 8.09624 6.63109 7.57144C6.65669 7.66104 6.66949 7.76344 6.65669 7.86584H6.89989C6.92549 7.59704 6.78469 7.39224 6.78469 7.39224C6.56709 7.03384 6.17029 7.04664 6.17029 7.04664C6.17029 7.04664 6.37509 7.13624 6.52869 7.35384C5.95269 7.84024 5.21029 8.12184 4.40389 8.12184C4.05829 8.12184 3.72549 8.07064 3.41829 7.96824L4.22469 7.16184L4.00709 6.57304C5.63269 6.00984 6.98949 5.57464 9.21669 5.17784L8.70469 4.80664L8.96069 4.65304C10.3047 5.02424 11.1879 5.29304 11.1367 6.00984C11.1111 6.12504 11.0727 6.26584 11.0087 6.41944C10.6247 7.18744 9.45989 8.48024 8.98629 9.01784C8.67909 9.37624 8.37189 9.72184 8.15429 10.0546C7.93669 10.3874 7.79589 10.7074 7.78309 11.0018C7.80869 13.3442 14.6695 9.91384 16.0007 9.00504C14.0423 9.84984 11.9303 10.6562 9.60069 10.8098C8.94789 10.8482 9.02469 10.5026 9.39589 9.99064Z" />
        </svg>
      );
    default:
      return null;
  }
}

export function RatioTriggerPreview({ ratio }: { ratio: string }) {
  const [ws, hs] = ratio.split(":");
  const w = parseFloat(ws), h = parseFloat(hs);
  if (!w || !h) return null;
  const maxW = 16, maxH = 12;
  let rw = maxW, rh = (h / w) * maxW;
  if (rh > maxH) { rh = maxH; rw = (w / h) * maxH; }
  return (
    <span style={{
      display: "inline-block",
      width: `${Math.round(rw)}px`,
      height: `${Math.round(rh)}px`,
      border: "1.5px solid currentColor",
      borderRadius: "2px",
      flexShrink: 0,
    }} />
  );
}

export function DiamondIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M9.7832 0.499878C10.3232 0.499878 10.6767 0.496482 11.0146 0.578979C11.1617 0.61491 11.3057 0.662985 11.4443 0.722534C11.7645 0.860077 12.0366 1.07387 12.4492 1.39148C13.1566 1.93605 13.7165 2.36662 14.127 2.75183C14.5421 3.14152 14.8482 3.52421 15.0088 3.99109C15.1407 4.37448 15.1904 4.77934 15.1543 5.18152C15.11 5.67308 14.9012 6.11252 14.5889 6.57898C14.2806 7.0392 13.8372 7.57315 13.2793 8.24695L10.6172 11.4628C10.115 12.0692 9.7038 12.5675 9.32715 12.9071C8.93826 13.2577 8.52095 13.4998 7.99902 13.4999C7.47706 13.4998 7.05981 13.2577 6.6709 12.9071C6.29425 12.5675 5.88301 12.0692 5.38086 11.4628L2.71875 8.24695C2.16068 7.573 1.71649 7.03928 1.4082 6.57898C1.09583 6.11253 0.88806 5.67308 0.84375 5.18152C0.807575 4.77927 0.857447 4.37442 0.989258 3.99109C1.14984 3.52425 1.45592 3.14152 1.87109 2.75183C2.28153 2.36662 2.84142 1.93606 3.54883 1.39148C3.96144 1.07384 4.23354 0.860066 4.55371 0.722534C4.69233 0.663015 4.83627 0.614905 4.9834 0.578979C5.32129 0.496532 5.67406 0.499877 6.21387 0.499878H9.7832ZM6.21387 1.49988C5.62618 1.49988 5.41459 1.50338 5.2207 1.55066C5.12692 1.57356 5.03539 1.60407 4.94824 1.64148C4.77007 1.71805 4.60994 1.83744 4.15918 2.18445C3.43571 2.74139 2.92207 3.13743 2.55566 3.48132C2.19409 3.82071 2.01931 4.06993 1.93457 4.31628C1.84817 4.56755 1.81638 4.83083 1.83984 5.09167C1.86269 5.34527 1.97017 5.62051 2.23926 6.02234C2.51258 6.43044 2.91688 6.91921 3.48828 7.60925L6.15039 10.8251C6.67274 11.4559 7.03123 11.8858 7.34082 12.1649C7.63783 12.4326 7.8253 12.4998 7.99902 12.4999C8.17274 12.4998 8.36021 12.4326 8.65723 12.1649C8.96678 11.8858 9.32443 11.4558 9.84668 10.8251L12.5098 7.60925C13.0811 6.91925 13.4855 6.43042 13.7588 6.02234C14.0278 5.62058 14.1353 5.34525 14.1582 5.09167C14.1816 4.83081 14.1498 4.56744 14.0635 4.31628C13.9788 4.06995 13.8039 3.82068 13.4424 3.48132C13.076 3.13744 12.5623 2.74138 11.8389 2.18445C11.3881 1.83744 11.228 1.71805 11.0498 1.64148C10.9627 1.60406 10.8712 1.57359 10.7773 1.55066C10.5834 1.50333 10.3713 1.49988 9.7832 1.49988H6.21387ZM9.33203 4.16687C9.6081 4.16695 9.83203 4.39078 9.83203 4.66687C9.83188 4.94283 9.60801 5.16679 9.33203 5.16687H6.66504C6.38915 5.16669 6.16519 4.94277 6.16504 4.66687C6.16504 4.39084 6.38905 4.16705 6.66504 4.16687H9.33203Z" />
    </svg>
  );
}

export function AspectIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
    </svg>
  );
}
