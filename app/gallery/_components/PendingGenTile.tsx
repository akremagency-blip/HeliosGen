"use client";
import React, { useEffect, useRef, useState } from "react";
import type { PendingGen } from "../_shared";

export function PendingGenTile({ pg, onCancel }: { pg: PendingGen; onCancel: () => void }) {
  return (
    <>
      {/* Top radial glow — blue-emerald with slow pulse */}
      <div style={{
        position: "absolute", top: "-40%", left: "50%", transform: "translateX(-50%)",
        width: "180%", height: "80%", pointerEvents: "none",
        background: "radial-gradient(ellipse at 50% 20%, rgba(20,160,140,0.45) 0%, rgba(30,100,200,0.2) 40%, transparent 70%)",
        animation: "pendingGlow 3s ease-in-out infinite",
      }} />
      {/* Top: phase label + cancel — same row, wraps to next line if too narrow */}
      <div style={{
        position: "absolute", top: 8, left: 8, right: 8,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: "6px",
        zIndex: 5,
      }}>
        {/* Phase pill */}
        <div style={{
          display: "flex", alignItems: "center", gap: "6px",
          height: "26px", padding: "0 10px", borderRadius: "999px",
          background: "rgba(0,0,0,0.58)", backdropFilter: "blur(10px)",
          border: pg.prePending ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(45,212,191,0.25)",
          pointerEvents: "none", flexShrink: 0,
        }}>
          {pg.prePending ? (
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none" style={{ animation: "spin 0.9s linear infinite", flexShrink: 0 }}>
              <circle cx="5" cy="5" r="4" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
              <path d="M5 1 A4 4 0 0 1 9 5" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none" style={{ animation: "spin 0.9s linear infinite", flexShrink: 0 }}>
              <circle cx="5" cy="5" r="4" stroke="rgba(45,212,191,0.25)" strokeWidth="1.5" />
              <path d="M5 1 A4 4 0 0 1 9 5" stroke="#2DD4BF" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          )}
          <span style={{ fontSize: "11px", color: pg.prePending ? "#888" : "#2DD4BF", fontWeight: 500 }}>
            {pg.prePending ? "Pending" : "Generating…"}
          </span>
        </div>

        {/* Cancel pill — only before generation starts */}
        {pg.prePending && (
          <button
            onClick={onCancel}
            style={{
              flexShrink: 0,
              display: "flex", alignItems: "center", gap: "5px",
              height: "26px", padding: "0 10px", borderRadius: "999px",
              background: "rgba(0,0,0,0.58)", backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer",
              transition: "background 140ms",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(0,0,0,0.58)")}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" />
              <path d="m6 6 12 12" />
            </svg>
            <span style={{ fontSize: "11px", color: "#ccc", fontWeight: 500 }}>Cancel</span>
          </button>
        )}
      </div>

      {/* Bottom: prompt */}
      {pg.prompt && (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "24px 10px 10px", background: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)" }}>
          <p style={{ margin: 0, fontSize: "11px", color: "rgba(255,255,255,0.35)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{pg.prompt}</p>
        </div>
      )}
    </>
  );
}
