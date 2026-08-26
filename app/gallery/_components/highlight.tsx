"use client";
import React from "react";
import { splitByMentions, type TaggedImage } from "../_shared";

export function syntaxHighlightJson(
  json: string,
  tagged?: TaggedImage[],
  onEnter?: (tag: TaggedImage, rect: DOMRect) => void,
  onLeave?: () => void,
  onMD?: (tag: TaggedImage) => void,
): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let k = 0;
  const push = (from: number, to: number, color?: string) => {
    if (from >= to) return;
    const text = json.slice(from, to);
    if (tagged?.length && onEnter && onLeave && onMD) {
      const { nodes, nextKey } = splitByMentions(text, color, tagged, k, onEnter, onLeave, onMD);
      parts.push(...nodes);
      k = nextKey;
    } else {
      parts.push(<span key={k++} style={color ? { color } : undefined}>{text}</span>);
    }
  };
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(true|false|null)|([{}\[\],])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(json)) !== null) {
    push(last, m.index);
    if (m[1] !== undefined) {
      if (m[2] !== undefined) {
        push(m.index, m.index + m[1].length, "#06b6d4");
        push(m.index + m[1].length, m.index + m[0].length, "#6b7280");
      } else {
        push(m.index, m.index + m[1].length, "#86efac");
      }
    } else if (m[3] !== undefined) {
      push(m.index, m.index + m[3].length, "#fb923c");
    } else if (m[4] !== undefined) {
      push(m.index, m.index + m[4].length, "#a78bfa");
    } else if (m[5] !== undefined) {
      push(m.index, m.index + m[5].length, "#6b7280");
    }
    last = re.lastIndex;
  }
  push(last, json.length);
  return <>{parts}</>;
}

export function syntaxHighlightYaml(
  yaml: string,
  tagged?: TaggedImage[],
  onEnter?: (tag: TaggedImage, rect: DOMRect) => void,
  onLeave?: () => void,
  onMD?: (tag: TaggedImage) => void,
): React.ReactNode {
  const lines = yaml.split("\n");
  const parts: React.ReactNode[] = [];
  let k = 0;
  lines.forEach((line, i) => {
    // Directive / document markers
    if (/^---/.test(line) || /^\.\.\.$/.test(line)) {
      parts.push(<span key={k++} style={{ color: "#6b7280" }}>{line}</span>);
    } else {
      // Key: value  (handles indent + optional list marker)
      const keyMatch = line.match(/^(\s*(?:-\s+)?)([\w\-./]+)(\s*:)(.*)/);
      if (keyMatch) {
        const [, indent, key, colon, rest] = keyMatch;
        parts.push(<span key={k++}>{indent}</span>);
        parts.push(<span key={k++} style={{ color: "#06b6d4" }}>{key}</span>);
        parts.push(<span key={k++} style={{ color: "#6b7280" }}>{colon}</span>);
        parts.push(<span key={k++}>{colorYamlValue(rest, k, tagged, onEnter, onLeave, onMD)}</span>);
        k++;
      } else {
        // List item or plain value
        const listMatch = line.match(/^(\s*-\s+)(.*)/);
        if (listMatch) {
          parts.push(<span key={k++} style={{ color: "#6b7280" }}>{listMatch[1]}</span>);
          parts.push(<span key={k++}>{colorYamlValue(listMatch[2], k, tagged, onEnter, onLeave, onMD)}</span>);
          k++;
        } else {
          if (tagged?.length && onEnter && onLeave && onMD) {
            const { nodes, nextKey } = splitByMentions(line, undefined, tagged, k, onEnter, onLeave, onMD);
            parts.push(...nodes);
            k = nextKey;
          } else {
            parts.push(<span key={k++}>{line}</span>);
          }
        }
      }
    }
    if (i < lines.length - 1) parts.push(<span key={k++}>{"\n"}</span>);
  });
  return <>{parts}</>;
}

function colorYamlValue(
  value: string,
  baseKey: number,
  tagged?: TaggedImage[],
  onEnter?: (tag: TaggedImage, rect: DOMRect) => void,
  onLeave?: () => void,
  onMD?: (tag: TaggedImage) => void,
): React.ReactNode {
  // Inline comment
  const commentIdx = value.search(/#/);
  const main = commentIdx >= 0 ? value.slice(0, commentIdx) : value;
  const comment = commentIdx >= 0 ? value.slice(commentIdx) : "";
  let k = baseKey * 100;
  const out: React.ReactNode[] = [];
  const trimmed = main.trim();

  const pushValue = (text: string, color?: string) => {
    if (tagged?.length && onEnter && onLeave && onMD) {
      const { nodes, nextKey } = splitByMentions(text, color, tagged, k, onEnter, onLeave, onMD);
      out.push(...nodes);
      k = nextKey;
    } else {
      out.push(<span key={k++} style={color ? { color } : undefined}>{text}</span>);
    }
  };

  if (/^(true|false|yes|no|on|off)$/i.test(trimmed)) {
    pushValue(main, "#a78bfa");
  } else if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed) || /^0x[\da-fA-F]+$/.test(trimmed)) {
    pushValue(main, "#fb923c");
  } else if (/^(null|~)$/.test(trimmed)) {
    pushValue(main, "#a78bfa");
  } else if (/^['"]/.test(trimmed)) {
    pushValue(main, "#86efac");
  } else if (trimmed !== "") {
    pushValue(main, "rgba(255,255,255,0.82)");
  } else {
    pushValue(main);
  }
  if (comment) out.push(<span key={k++} style={{ color: "#4b5563" }}>{comment}</span>);
  return <>{out}</>;
}

