"use client";
import React, { useState } from "react";
import type { DownloadTask } from "../_shared";

export function DownloadToast({ downloads, onClear }: { downloads: DownloadTask[]; onClear: () => void }) {
  const [collapsed, setCollapsed] = useState(false);

  if (downloads.length === 0) return null;

  const allDone = downloads.every(d => d.status !== "preparing");
  const title = allDone ? "Download complete" : "Preparing download";

  return (
    <div style={{
      position: "fixed",
      top: "64px",
      right: "16px",
      width: "300px",
      background: "rgba(16,18,20,0.97)",
      backdropFilter: "blur(24px)",
      WebkitBackdropFilter: "blur(24px)",
      borderRadius: "18px",
      border: "1px solid rgba(255,255,255,0.07)",
      boxShadow: "0 12px 48px rgba(0,0,0,0.7), 0 2px 12px rgba(0,0,0,0.4)",
      zIndex: 9500,
      overflow: "hidden",
      fontFamily: "inherit",
    }}>
      {/* Header */}
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 14px 14px 14px", cursor: "pointer", userSelect: "none" }}
      >
        {/* Animated icon */}
        <div style={{ position: "relative", width: "28px", height: "28px", flexShrink: 0 }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" style={{ position: "absolute", inset: 0 }}>
            <circle cx="14" cy="14" r="12" stroke="rgba(119,229,68,0.2)" strokeWidth="2" />
            <circle
              cx="14" cy="14" r="12"
              stroke="#2DD4BF" strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 12}`}
              strokeDashoffset={allDone ? 0 : `${2 * Math.PI * 12 * 0.25}`}
              style={{ transformOrigin: "center", transform: "rotate(-90deg)", transition: "stroke-dashoffset 0.4s ease" }}
              className={allDone ? undefined : "dl-ring-spin"}
            />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2DD4BF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
        </div>
        <span style={{ flex: 1, fontSize: "14px", fontWeight: 600, color: "#ffffff", letterSpacing: "-0.01em" }}>{title}</span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2.5" strokeLinecap="round"
          style={{ flexShrink: 0, transition: "transform 200ms", transform: collapsed ? "rotate(180deg)" : "none" }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>

      {/* Items */}
      {!collapsed && (
        <div style={{ padding: "0 8px 8px" }}>
          {downloads.map(task => (
            <div key={task.id} style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "9px 10px",
              background: "rgba(255,255,255,0.035)",
              borderRadius: "10px",
              marginBottom: "4px",
            }}>
              {/* File icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={task.status === "preparing" ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.45)"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M3 6h18M3 12h18M3 18h18" />
                <rect x="2" y="4" width="20" height="16" rx="2" />
              </svg>
              {/* Label */}
              <span style={{ flex: 1, fontSize: "13px", color: task.status === "preparing" ? "rgba(255,255,255,0.35)" : "#ffffff", letterSpacing: "-0.01em" }}>
                {task.status === "preparing" ? "Preparing…" : task.status === "error" ? "Failed" : "Ready"}
              </span>
              {/* Status indicator */}
              {task.status === "preparing" ? (
                <div style={{ width: "16px", height: "16px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.12)", borderTopColor: "rgba(255,255,255,0.45)", animation: "spin 0.9s linear infinite", flexShrink: 0 }} />
              ) : task.status === "error" ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                </svg>
              ) : (
                <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: "#2DD4BF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#060A06" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
