import { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import {
  addCustomSubject,
  getAllSubjects,
  getSubjectMeta,
} from "../services/subjects";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const MAX_PROMPT_LENGTH = 2400;
const DEFAULT_TOKEN = "prototype_default_token";

function getToken() {
  return typeof window !== "undefined"
    ? localStorage.getItem("token") || DEFAULT_TOKEN
    : DEFAULT_TOKEN;
}

function getAuthHeaders(extraHeaders = {}) {
  const token = getToken();
  return token
    ? { ...extraHeaders, Authorization: `Bearer ${token}` }
    : extraHeaders;
}

function parseRoadmapHeading(value) {
  const cleaned = (value || "").toString().replace(/\s+/g, " ").trim();
  if (!cleaned) return { chapter: "", topics: [] };

  const separatorIndex = cleaned.indexOf(":");
  if (separatorIndex === -1) {
    return { chapter: cleaned, topics: [] };
  }

  const chapter = cleaned.slice(0, separatorIndex).trim();
  const remainder = cleaned.slice(separatorIndex + 1).trim();
  const seen = new Set();
  const topics = remainder
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const normalized = normalizeTopicToken(item);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });

  return {
    chapter: chapter || cleaned,
    topics,
  };
}

function summarizeGraphForLibrary(graphData, fallbackTitle, fallbackSubject) {
  return {
    id: graphData?.id,
    title: graphData?.title || fallbackTitle || "Untitled Graph",
    subject: graphData?.subject || fallbackSubject || "General",
    user_prompt: graphData?.user_prompt || "",
    topics_used: graphData?.topics_used || [],
    created_at: graphData?.created_at,
    input_mode: graphData?.input_mode || "text",
    source_filename: graphData?.source_filename || "",
    topics_used_count: graphData?.topics_used?.length || 0,
    node_count:
      graphData?.node_count || Object.keys(graphData?.graph || {}).length,
    edge_count:
      graphData?.edge_count ||
      Object.values(graphData?.graph || {}).reduce(
        (count, value) => count + (Array.isArray(value) ? value.length : 0),
        0,
      ),
  };
}

const SUBJECT_TONES = {
  Physics: {
    accent: "#5bd0ff",
    glow: "rgba(91,208,255,0.34)",
    tone: "tone-physics",
  },
  Chemistry: {
    accent: "#93ff78",
    glow: "rgba(147,255,120,0.32)",
    tone: "tone-chemistry",
  },
  Mathematics: {
    accent: "#c79bff",
    glow: "rgba(199,155,255,0.34)",
    tone: "tone-mathematics",
  },
  Biology: {
    accent: "#ffc66d",
    glow: "rgba(255,198,109,0.34)",
    tone: "tone-biology",
  },
  History: {
    accent: "#ff8b6b",
    glow: "rgba(255,139,107,0.33)",
    tone: "tone-history",
  },
  Geography: {
    accent: "#59f0c2",
    glow: "rgba(89,240,194,0.33)",
    tone: "tone-geography",
  },
  English: {
    accent: "#ff8fb3",
    glow: "rgba(255,143,179,0.32)",
    tone: "tone-english",
  },
  Computer: {
    accent: "#7ea2ff",
    glow: "rgba(126,162,255,0.34)",
    tone: "tone-computer",
  },
  General: {
    accent: "#f0f3ff",
    glow: "rgba(240,243,255,0.24)",
    tone: "tone-general",
  },
};

function getSubjectTone(name) {
  return SUBJECT_TONES[name] || SUBJECT_TONES.General;
}

function buildConstellationSubject(name) {
  const meta = getSubjectMeta(name);
  return {
    ...meta,
    ...getSubjectTone(meta.name || name),
    name: meta.name || name || "General",
  };
}

async function generateTopicGraph(userPrompt, subject) {
  const res = await fetch(`${BASE}/topic-graph/`, {
    method: "POST",
    headers: getAuthHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ user_prompt: userPrompt, subject }),
  });

  if (!res.ok) {
    throw new Error(`Topic graph request failed with ${res.status}`);
  }

  return res.json();
}

async function generateTopicGraphFromFile(file, subject) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("subject", subject || "General");

  const res = await fetch(`${BASE}/topic-graph/upload/`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Topic graph upload failed with ${res.status}`);
  }

  return res.json();
}

async function fetchSavedTopicGraphs() {
  const res = await fetch(`${BASE}/topic-graph/`, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Saved topic graph request failed with ${res.status}`);
  }

  return res.json();
}

async function fetchTopicGraphById(graphId) {
  const res = await fetch(`${BASE}/topic-graph/${graphId}`, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Topic graph fetch failed with ${res.status}`);
  }

  return res.json();
}

async function deleteTopicGraph(graphId) {
  const res = await fetch(`${BASE}/topic-graph/${graphId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Topic graph delete failed with ${res.status}`);
  }

  return res.json();
}

async function fetchNotesIndex() {
  const res = await fetch(`${BASE}/notes/`, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Notes request failed with ${res.status}`);
  }

  return res.json();
}

async function updateTopicNodeStatus(graphId, nodeLabel, isMarkedDone) {
  const res = await fetch(
    `${BASE}/topic_graphs/${encodeURIComponent(graphId)}/nodes/${encodeURIComponent(nodeLabel)}`,
    {
      method: "PATCH",
      headers: getAuthHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ is_marked_done: isMarkedDone }),
    },
  );

  if (!res.ok) {
    throw new Error(`Topic node update failed with ${res.status}`);
  }

  return res.json();
}

function formatDateTime(value) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function normalizeTopicToken(value) {
  return (value || "").toString().trim().toLowerCase().replace(/\s+/g, " ");
}

function noteTopicTokens(note) {
  return (note?.topic || "")
    .split(",")
    .map((item) => normalizeTopicToken(item))
    .filter(Boolean);
}

function findNoteForNode(notes, label) {
  const target = normalizeTopicToken(label);
  return (
    (notes || []).find((note) => noteTopicTokens(note).includes(target)) || null
  );
}

function findNotesForNode(notes, label) {
  const target = normalizeTopicToken(label);
  return (notes || []).filter((note) => noteTopicTokens(note).includes(target));
}

function truncateNodeLabel(label, sizePx) {
  const budget = Math.max(12, Math.floor(sizePx / 4.6));
  if (!label || label.length <= budget) return label;
  return `${label.slice(0, Math.max(0, budget - 3)).trimEnd()}...`;
}

function graphEntries(graph) {
  return Object.entries(graph || {}).filter(
    ([key, value]) => key && Array.isArray(value),
  );
}

function averageIndex(items, orderMap, fallback) {
  if (!items.length) return fallback;
  return (
    items.reduce((sum, item) => sum + (orderMap[item] ?? fallback), 0) /
    items.length
  );
}

function averageLane(items, laneMap, fallback) {
  const values = items
    .map((item) => laneMap[item])
    .filter((value) => Number.isFinite(value));
  if (!values.length) return fallback;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeLanes(values, gap) {
  if (!values.length) return [];
  const lanes = [...values];

  for (let index = 1; index < lanes.length; index += 1) {
    if (lanes[index] - lanes[index - 1] < gap) {
      lanes[index] = lanes[index - 1] + gap;
    }
  }

  for (let index = lanes.length - 2; index >= 0; index -= 1) {
    if (lanes[index + 1] - lanes[index] < gap) {
      lanes[index] = lanes[index + 1] - gap;
    }
  }

  const mid = (lanes[0] + lanes[lanes.length - 1]) / 2;
  return lanes.map((value) => value - mid);
}

function assignLayerLanes(layerKeys, layers, incoming, outgoing) {
  const laneMap = {};
  const laneGap = 1.18;

  for (let pass = 0; pass < 6; pass += 1) {
    const forward = pass % 2 === 0;
    const orderedLevels = forward ? layerKeys : [...layerKeys].reverse();

    orderedLevels.forEach((level) => {
      const group = layers[level] || [];
      if (!group.length) return;

      const desired = group.map((label, index) => {
        const refs = forward ? incoming[label] : outgoing[label];
        return averageLane(refs, laneMap, index * laneGap);
      });

      const normalized = normalizeLanes(desired, laneGap);
      group.forEach((label, index) => {
        laneMap[label] = normalized[index];
      });
    });
  }

  return laneMap;
}

function buildGraphScene(graph) {
  const entries = graphEntries(graph);
  const labels = new Set();

  entries.forEach(([topic, dependents]) => {
    labels.add(topic);
    dependents.forEach((child) => {
      if (child) labels.add(child);
    });
  });

  const incoming = {};
  const outgoing = {};

  labels.forEach((label) => {
    incoming[label] = [];
    outgoing[label] = [];
  });

  entries.forEach(([topic, dependents]) => {
    dependents.forEach((child) => {
      if (!labels.has(child)) return;
      outgoing[topic].push(child);
      incoming[child].push(topic);
    });
  });

  const indegree = {};
  labels.forEach((label) => {
    indegree[label] = incoming[label].length;
  });

  const queue = Object.keys(indegree).filter((label) => indegree[label] === 0);
  const topo = [];

  while (queue.length) {
    const current = queue.shift();
    topo.push(current);
    outgoing[current].forEach((child) => {
      indegree[child] -= 1;
      if (indegree[child] === 0) queue.push(child);
    });
  }

  if (topo.length !== labels.size) {
    Object.keys(outgoing).forEach((label) => {
      if (!topo.includes(label)) topo.push(label);
    });
  }

  const levelMap = {};
  topo.forEach((label) => {
    const parents = incoming[label];
    levelMap[label] = parents.length
      ? Math.max(...parents.map((parent) => levelMap[parent] || 0)) + 1
      : 0;
  });

  const layers = {};
  topo.forEach((label) => {
    const level = levelMap[label] || 0;
    if (!layers[level]) layers[level] = [];
    layers[level].push(label);
  });

  const layerKeys = Object.keys(layers)
    .map(Number)
    .sort((a, b) => a - b);

  layerKeys.forEach((level) => {
    layers[level].sort((a, b) => topo.indexOf(a) - topo.indexOf(b));
  });

  for (let pass = 0; pass < 4; pass += 1) {
    const direction = pass % 2 === 0 ? "forward" : "backward";
    const orderedLevels =
      direction === "forward" ? layerKeys : [...layerKeys].reverse();

    orderedLevels.forEach((level) => {
      const currentLayer = layers[level] || [];
      const referenceLayer =
        direction === "forward"
          ? layers[level - 1] || []
          : layers[level + 1] || [];
      if (!currentLayer.length || !referenceLayer.length) return;

      const referenceOrder = Object.fromEntries(
        referenceLayer.map((label, index) => [label, index]),
      );
      currentLayer.sort((a, b) => {
        const aTargets = direction === "forward" ? incoming[a] : outgoing[a];
        const bTargets = direction === "forward" ? incoming[b] : outgoing[b];
        const aScore = averageIndex(aTargets, referenceOrder, topo.indexOf(a));
        const bScore = averageIndex(bTargets, referenceOrder, topo.indexOf(b));
        if (aScore === bScore) return topo.indexOf(a) - topo.indexOf(b);
        return aScore - bScore;
      });
    });
  }

  const laneMap = assignLayerLanes(layerKeys, layers, incoming, outgoing);
  const layerGap = 560;
  const rowGap = 262;
  const depthGap = 18;
  const nodes = [];

  layerKeys.forEach((level) => {
    const group = [...layers[level]];

    group.forEach((label, index) => {
      const parentCount = incoming[label].length;
      const childCount = outgoing[label].length;
      const lane = laneMap[label] ?? (index - (group.length - 1) / 2) * 1.18;
      const localDepth =
        (index % 2 === 0 ? 1 : -1) * depthGap + (level % 2 === 0 ? -8 : 8);

      nodes.push({
        id: label,
        label,
        level,
        prerequisites: incoming[label],
        dependents: outgoing[label],
        x: level * layerGap,
        y: lane * rowGap,
        z: localDepth,
        size: 84 + Math.min(childCount + parentCount, 5) * 9,
      });
    });
  });

  const nodeMap = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const links = [];
  const sourceOrder = {};
  const targetOrder = {};
  const corridorCounts = {};

  entries.forEach(([source, dependents]) => {
    dependents.forEach((target) => {
      if (!nodeMap[source] || !nodeMap[target]) return;
      const sourceSiblingIndex = sourceOrder[source] || 0;
      const targetSiblingIndex = targetOrder[target] || 0;
      sourceOrder[source] = sourceSiblingIndex + 1;
      targetOrder[target] = targetSiblingIndex + 1;
      const corridorMid = Math.round(
        (nodeMap[source].y + nodeMap[target].y) / 180,
      );
      const corridorKey = `${nodeMap[source].level}:${nodeMap[target].level}:${corridorMid}`;
      corridorCounts[corridorKey] = (corridorCounts[corridorKey] || 0) + 1;
      links.push({
        id: `${source}__${target}`,
        source,
        target,
        sourceSiblingIndex,
        sourceSiblingCount: outgoing[source].length,
        targetSiblingIndex,
        targetSiblingCount: incoming[target].length,
        levelSpan: Math.max(
          1,
          (nodeMap[target].level || 0) - (nodeMap[source].level || 0),
        ),
        corridorKey,
      });
    });
  });

  const corridorOffsets = {};
  links.forEach((link) => {
    const offset = corridorOffsets[link.corridorKey] || 0;
    corridorOffsets[link.corridorKey] = offset + 1;
    link.corridorIndex = offset;
    link.corridorCount = corridorCounts[link.corridorKey] || 1;
  });

  return {
    nodes,
    links,
    stats: {
      topicCount: nodes.length,
      connectionCount: links.length,
      rootCount: nodes.filter((node) => node.prerequisites.length === 0).length,
      depthCount: layerKeys.length,
    },
  };
}

function projectPoint(point, view, width, height) {
  const camera = 920;
  const depth = camera / Math.max(camera - point.z, 240);
  const scale = depth * view.scale;
  const isoX = point.x + point.z * 0.1;
  const isoY = point.y - point.z * 0.05;

  return {
    x: width / 2 + view.panX + isoX * scale,
    y: height / 2 + view.panY + isoY * scale,
    z: point.z,
    depth,
    scale,
  };
}

function screenPath(source, target, link) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const sourceFan =
    (link.sourceSiblingIndex - (link.sourceSiblingCount - 1) / 2) * 12;
  const targetFan =
    (link.targetSiblingIndex - (link.targetSiblingCount - 1) / 2) * 12;
  const corridorSpread =
    (link.corridorIndex - (link.corridorCount - 1) / 2) * 22;
  const closeEdgeArc =
    Math.abs(dy) < 92 ? (dy >= 0 ? 1 : -1) * (88 - Math.abs(dy)) : 0;
  const fanOffset =
    sourceFan * 0.62 + targetFan * 0.72 + corridorSpread + closeEdgeArc;
  const spanBoost = Math.max(0, link.levelSpan - 1) * 18;
  const curveX = Math.min(
    280,
    Math.max(112, Math.abs(dx) * 0.4) +
      spanBoost +
      Math.abs(corridorSpread) * 0.6,
  );
  const startX = source.x + 18;
  const startY = source.y + sourceFan;
  const endX = target.x - 18;
  const endY = target.y + targetFan;
  const ctrl1X = startX + curveX;
  const ctrl2X = endX - curveX;
  const ctrl1Y = startY + fanOffset;
  const ctrl2Y = endY + fanOffset;

  return [
    `M ${startX.toFixed(1)} ${startY.toFixed(1)}`,
    `C ${ctrl1X.toFixed(1)} ${ctrl1Y.toFixed(1)},`,
    `${ctrl2X.toFixed(1)} ${ctrl2Y.toFixed(1)},`,
    `${endX.toFixed(1)} ${endY.toFixed(1)}`,
  ].join(" ");
}

function cubicPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return (
    mt ** 3 * p0 + 3 * mt ** 2 * t * p1 + 3 * mt * t ** 2 * p2 + t ** 3 * p3
  );
}

function cubicTangent(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return (
    3 * mt ** 2 * (p1 - p0) + 6 * mt * t * (p2 - p1) + 3 * t ** 2 * (p3 - p2)
  );
}

function edgeArrowGeometry(source, target, link) {
  const dx = target.x - source.x;
  const sourceFan =
    (link.sourceSiblingIndex - (link.sourceSiblingCount - 1) / 2) * 12;
  const targetFan =
    (link.targetSiblingIndex - (link.targetSiblingCount - 1) / 2) * 12;
  const fanOffset = sourceFan * 0.62 + targetFan * 0.72;
  const spanBoost = Math.max(0, link.levelSpan - 1) * 18;
  const curveX = Math.min(240, Math.max(96, Math.abs(dx) * 0.38) + spanBoost);
  const startX = source.x + 18;
  const startY = source.y + sourceFan;
  const endX = target.x - 18;
  const endY = target.y + targetFan;
  const ctrl1X = startX + curveX;
  const ctrl2X = endX - curveX;
  const ctrl1Y = startY + fanOffset;
  const ctrl2Y = endY + fanOffset;
  const t = 0.5;

  return {
    x: cubicPoint(startX, ctrl1X, ctrl2X, endX, t),
    y: cubicPoint(startY, ctrl1Y, ctrl2Y, endY, t),
    angle:
      Math.atan2(
        cubicTangent(startY, ctrl1Y, ctrl2Y, endY, t),
        cubicTangent(startX, ctrl1X, ctrl2X, endX, t),
      ) *
      (180 / Math.PI),
  };
}

function getProjectedBounds(nodes, view, width, height) {
  if (!nodes.length) {
    return { minX: 0, maxX: width, minY: 0, maxY: height };
  }

  const projected = nodes.map((node) =>
    projectPoint(node, view, width, height),
  );

  return {
    minX: Math.min(...projected.map((point) => point.x)),
    maxX: Math.max(...projected.map((point) => point.x)),
    minY: Math.min(...projected.map((point) => point.y)),
    maxY: Math.max(...projected.map((point) => point.y)),
  };
}

function createFittedView(sceneNodes, width, height) {
  const baseView = {
    scale: 0.92,
    panX: 0,
    panY: 0,
  };

  const bounds = getProjectedBounds(sceneNodes, baseView, width, height);
  const spanX = Math.max(bounds.maxX - bounds.minX, 320);
  const spanY = Math.max(bounds.maxY - bounds.minY, 240);
  const targetScale =
    Math.min((width - 180) / spanX, (height - 170) / spanY, 1.22) *
    baseView.scale;
  const scaledView = { ...baseView, scale: Math.max(0.3, targetScale) };
  const scaledBounds = getProjectedBounds(
    sceneNodes,
    scaledView,
    width,
    height,
  );

  return {
    ...scaledView,
    panX: width / 2 - (scaledBounds.minX + scaledBounds.maxX) / 2,
    panY: height / 2 - (scaledBounds.minY + scaledBounds.maxY) / 2,
  };
}

function LoadingScreen({
  message = "Mapping Constellation...",
  subMessage = "Synthesizing topic relationships",
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(ellipse at 15% 0%, rgba(91,208,255,0.10) 0%, transparent 38%), radial-gradient(ellipse at 85% 8%, rgba(199,155,255,0.09) 0%, transparent 30%), linear-gradient(180deg,#04060e,#060913)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        fontFamily: "Sora, sans-serif",
      }}
    >
      <div style={{ position: "relative", width: 72, height: 72 }}>
        {/* Layer 1: Static Outer Ring */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "1.5px solid rgba(108,99,255,0.15)",
          }}
        />
        {/* Layer 2: Fast Outer Spin (Intelligence Violet) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "2px solid transparent",
            borderTopColor: "#6C63FF",
            animation: "spin 0.9s linear infinite",
          }}
        />
        {/* Layer 3: Static Mid Ring */}
        <div
          style={{
            position: "absolute",
            inset: 10,
            borderRadius: "50%",
            border: "1.5px solid rgba(79,172,254,0.2)",
          }}
        />
        {/* Layer 4: Reverse Inner Spin (Constellation Blue) */}
        <div
          style={{
            position: "absolute",
            inset: 10,
            borderRadius: "50%",
            border: "1.5px solid transparent",
            borderTopColor: "#4FACFE",
            animation: "spin 1.4s linear infinite reverse",
          }}
        />
        {/* Layer 5: Inner Core Constellation Glow */}
        <div
          style={{
            position: "absolute",
            inset: 20,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(79,172,254,0.4), transparent)",
          }}
        />
      </div>

      <div
        style={{
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <p
          style={{
            fontSize: 15,
            color: "#9b95ff",
            fontWeight: 800,
            letterSpacing: "-0.3px",
            margin: 0,
          }}
        >
          {message}
        </p>
        <p
          style={{ fontSize: 12, color: "#333360", fontWeight: 600, margin: 0 }}
        >
          {subMessage}
        </p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function SubjectScreen({ subjects, graphCounts, onAddSubject, onSelect }) {
  const router = useRouter();

  return (
    <div className="screen">
      <header className="hdr">
        <button
          className="back-btn"
          onClick={() => router.back()}
          aria-label="Go back"
        >
          &larr;
        </button>
        <div>
          <span className="hdr-title">Constellations</span>
        </div>
      </header>

      <div className="body">
        <section className="hero-card">
          <h1 className="hero-kicker">Interactive Topic Graph</h1>
          <p> </p>
        </section>
        <div className="subject-grid">
          {subjects.map((subject, index) => (
            <button
              key={subject.name}
              type="button"
              className={`subject-card ${subject.tone}`}
              style={{ animationDelay: `${index * 0.04}s` }}
              onClick={() => onSelect(subject)}
            >
              <span className="subject-name">{subject.name}</span>
              <span className="subject-count">
                {graphCounts[subject.name] || 0} constellation
                {(graphCounts[subject.name] || 0) === 1 ? "" : "s"}
              </span>
            </button>
          ))}
          <button
            type="button"
            className="subject-card add-card"
            style={{ animationDelay: `${subjects.length * 0.04}s` }}
            onClick={onAddSubject}
          >
            <span className="subject-name">Add Subject</span>
            <span className="subject-count">0 constellations</span>
          </button>
        </div>
      </div>

      <style jsx>{`
        ${commonStyles}

        .hero-card {
          position: relative;
          overflow: hidden;
          padding: 24px;
          border-radius: 28px;
          margin-bottom: 24px;
          background:
            radial-gradient(
              circle at top left,
              rgba(91, 208, 255, 0.16),
              transparent 34%
            ),
            radial-gradient(
              circle at bottom right,
              rgba(199, 155, 255, 0.18),
              transparent 28%
            ),
            linear-gradient(
              180deg,
              rgba(17, 22, 45, 0.96),
              rgba(7, 10, 23, 0.98)
            );
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 30px 90px rgba(0, 0, 0, 0.32);
        }
        .hero-kicker {
          font-size: 11px;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: #7dd3fc;
          margin-bottom: 10px;
        }
        .hero-card h1 {
          font-size: 32px;
          line-height: 1.05;
          margin-bottom: 14px;
          max-width: 12ch;
        }
        .hero-card p {
          font-size: 14px;
          line-height: 1.7;
          color: #9ea8c7;
          max-width: 58ch;
        }
        .subject-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }
        .subject-card {
          position: relative;
          overflow: hidden;
          text-align: left;
          padding: 18px 16px;
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #f7f8ff;
          cursor: pointer;
          min-height: 118px;
          background: rgba(255, 255, 255, 0.03);
          transition:
            transform 0.18s ease,
            border-color 0.18s ease,
            box-shadow 0.18s ease;
          animation: cardUp 0.35s ease both;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 12px;
        }
        .subject-card:hover {
          transform: translateY(-4px) scale(1.01);
          border-color: rgba(255, 255, 255, 0.16);
          box-shadow: 0 18px 44px rgba(0, 0, 0, 0.22);
        }
        .subject-card::before {
          content: "";
          position: absolute;
          inset: auto -20% -35% auto;
          width: 120px;
          height: 120px;
          border-radius: 999px;
          filter: blur(10px);
          opacity: 0.72;
        }
        .subject-name {
          position: relative;
          display: block;
          font-size: 18px;
          font-weight: 800;
        }
        .subject-count {
          position: relative;
          display: block;
          font-size: 13px;
          font-weight: 700;
          color: #d9dfff;
        }
        .add-card {
          background: linear-gradient(
            160deg,
            rgba(29, 34, 53, 0.96),
            rgba(11, 14, 26, 0.96)
          );
        }
        .add-card::before {
          background: rgba(240, 243, 255, 0.14);
        }
        .tone-physics {
          background: linear-gradient(
            160deg,
            rgba(16, 34, 63, 0.96),
            rgba(9, 18, 36, 0.96)
          );
        }
        .tone-physics::before {
          background: rgba(91, 208, 255, 0.3);
        }
        .tone-chemistry {
          background: linear-gradient(
            160deg,
            rgba(18, 43, 30, 0.96),
            rgba(8, 23, 17, 0.96)
          );
        }
        .tone-chemistry::before {
          background: rgba(147, 255, 120, 0.28);
        }
        .tone-mathematics {
          background: linear-gradient(
            160deg,
            rgba(39, 26, 62, 0.96),
            rgba(17, 10, 30, 0.96)
          );
        }
        .tone-mathematics::before {
          background: rgba(199, 155, 255, 0.28);
        }
        .tone-biology {
          background: linear-gradient(
            160deg,
            rgba(63, 37, 16, 0.96),
            rgba(28, 17, 7, 0.96)
          );
        }
        .tone-biology::before {
          background: rgba(255, 198, 109, 0.28);
        }
        .tone-history {
          background: linear-gradient(
            160deg,
            rgba(64, 24, 15, 0.96),
            rgba(28, 10, 7, 0.96)
          );
        }
        .tone-history::before {
          background: rgba(255, 139, 107, 0.28);
        }
        .tone-geography {
          background: linear-gradient(
            160deg,
            rgba(12, 54, 48, 0.96),
            rgba(6, 24, 22, 0.96)
          );
        }
        .tone-geography::before {
          background: rgba(89, 240, 194, 0.28);
        }
        .tone-english {
          background: linear-gradient(
            160deg,
            rgba(61, 21, 40, 0.96),
            rgba(28, 9, 20, 0.96)
          );
        }
        .tone-english::before {
          background: rgba(255, 143, 179, 0.26);
        }
        .tone-computer {
          background: linear-gradient(
            160deg,
            rgba(19, 30, 70, 0.96),
            rgba(9, 14, 32, 0.96)
          );
        }
        .tone-computer::before {
          background: rgba(126, 162, 255, 0.28);
        }
        .tone-general {
          background: linear-gradient(
            160deg,
            rgba(34, 39, 56, 0.96),
            rgba(15, 18, 29, 0.96)
          );
        }
        .tone-general::before {
          background: rgba(240, 243, 255, 0.18);
        }
        @keyframes cardUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        @media (max-width: 760px) {
          .subject-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 460px) {
          .subject-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

function BuilderScreen({ subject, onBack, onOpenGraph }) {
  const [prompt, setPrompt] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [error, setError] = useState("");
  const [libraryError, setLibraryError] = useState("");
  const [savedGraphs, setSavedGraphs] = useState([]);
  const [activeGraphId, setActiveGraphId] = useState("");
  const [deletingGraphId, setDeletingGraphId] = useState("");

  const fileInputRef = useRef(null);
  const isPdfUpload = Boolean(
    imageFile &&
    (imageFile.type === "application/pdf" ||
      imageFile.name?.toLowerCase().endsWith(".pdf")),
  );

  useEffect(() => {
    if (!imageFile) {
      setImagePreview("");
      return undefined;
    }

    const objectUrl = URL.createObjectURL(imageFile);
    setImagePreview(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedGraphs() {
      setLibraryLoading(true);
      setLibraryError("");

      try {
        const data = await fetchSavedTopicGraphs();
        if (!cancelled) {
          const filtered = (data || []).filter(
            (item) => (item.subject || "General") === subject.name,
          );
          setSavedGraphs(filtered);
        }
      } catch (err) {
        if (!cancelled) {
          setLibraryError(err.message || "Unable to load saved graphs.");
        }
      } finally {
        if (!cancelled) setLibraryLoading(false);
      }
    }

    loadSavedGraphs();

    return () => {
      cancelled = true;
    };
  }, [subject.name]);

  async function handleGenerate() {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt && !imageFile) {
      setError("Enter a chapter prompt or upload a syllabus image/PDF first.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data =
        imageFile && !trimmedPrompt
          ? await generateTopicGraphFromFile(imageFile, subject.name)
          : await generateTopicGraph(trimmedPrompt, subject.name);
      if (!graphEntries(data?.graph).length) {
        throw new Error("The graph response was empty.");
      }
      setActiveGraphId(data.id || "");
      setSavedGraphs((current) => {
        const summary = summarizeGraphForLibrary(
          data,
          trimmedPrompt.slice(0, 80),
          subject.name,
        );
        return [summary, ...current.filter((item) => item.id !== summary.id)];
      });
      onOpenGraph(data);
    } catch (err) {
      setError(err.message || "Unable to generate the roadmap.");
    } finally {
      setLoading(false);
    }
  }

  function resetAll() {
    setPrompt("");
    setImageFile(null);
    setError("");
    setActiveGraphId("");
  }

  async function handleDeleteGraph(graphId) {
    if (!graphId || deletingGraphId) return;
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm("Delete this saved graph permanently?");
    if (!confirmed) return;

    setDeletingGraphId(graphId);
    setLibraryError("");

    try {
      await deleteTopicGraph(graphId);
      setSavedGraphs((current) =>
        current.filter((item) => item.id !== graphId),
      );
      if (activeGraphId === graphId) {
        setActiveGraphId("");
      }
    } catch (err) {
      setLibraryError(err.message || "Unable to delete the saved graph.");
    } finally {
      setDeletingGraphId("");
    }
  }

  async function openSavedGraph(graphId) {
    setError("");
    setLoading(true);

    try {
      const data = await fetchTopicGraphById(graphId);
      setPrompt(data.user_prompt || "");
      setActiveGraphId(data.id || graphId);
      onOpenGraph(data);
    } catch (err) {
      setError(err.message || "Unable to open the saved roadmap.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="screen">
      <header className="hdr">
        <button className="back-btn" onClick={onBack} aria-label="Go back">
          &larr;
        </button>
        <div style={{ flex: 1 }}>
          <span className="hdr-title">{subject.name} Constellation</span>
        </div>
        <div
          className="subject-chip"
          style={{ borderColor: subject.glow, color: subject.accent }}
        >
          {subject.name}
        </div>
      </header>

      <div className="builder-shell">
        <section className="composer-panel">
          <div className="panel-head">
            <div>
              <h1>Build the roadmap input</h1>
            </div>
            <button type="button" className="ghost-btn" onClick={resetAll}>
              Clear
            </button>
          </div>

          <div className="option-grid">
            <div className="option-card option-card--text">
              <div className="option-top">
                <span className="option-tag">Option 1</span>
                <span className="option-label">Text prompt</span>
              </div>
              <textarea
                value={prompt}
                onChange={(event) =>
                  setPrompt(event.target.value.slice(0, MAX_PROMPT_LENGTH))
                }
                placeholder="Enter your chapter name. Also provide the name of reference book to follow and the list of topics, if possible."
              />
            </div>

            <div className="option-card option-card--image">
              <div className="option-top">
                <span className="option-tag">Option 2</span>
                <span className="option-label">Syllabus image</span>
              </div>
              <div
                className="upload-shell"
                onClick={() => fileInputRef.current?.click()}
              >
                {imagePreview && !isPdfUpload ? (
                  <img
                    src={imagePreview}
                    alt="Uploaded syllabus preview"
                    className="preview-image"
                  />
                ) : isPdfUpload ? (
                  <div className="upload-copy">
                    <strong>{imageFile?.name || "PDF selected"}</strong>
                    <span>
                      PDF syllabus ready. We will extract the text and generate
                      the roadmap from it.
                    </span>
                  </div>
                ) : (
                  <div className="upload-copy">
                    <strong>Upload an image of your syllabus structure</strong>
                    <span>PNG, JPG, WEBP, or PDF.</span>
                  </div>
                )}
              </div>
              <div className="input-meta">
                <span>{imageFile ? imageFile.name : "No file selected"}</span>
                <button
                  type="button"
                  className="inline-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose image
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                style={{ display: "none" }}
                onChange={(event) =>
                  setImageFile(event.target.files?.[0] || null)
                }
              />
            </div>
          </div>

          <div className="action-row">
            <button
              type="button"
              className="primary-btn"
              onClick={handleGenerate}
              disabled={loading}
            >
              {loading
                ? "Generating roadmap..."
                : imageFile && !prompt.trim()
                  ? "Generate From Syllabus File"
                  : "Generate Topic Graph"}
            </button>
          </div>

          {error ? <div className="error-box">{error}</div> : null}
        </section>

        <section className="visual-panel">
          <div className="library-panel">
            <div className="library-head">
              <div>
                <h2>Saved Graphs</h2>
              </div>
              <span className="library-count">{savedGraphs.length}</span>
            </div>

            {libraryLoading ? (
              <div className="library-state">Loading saved graphs...</div>
            ) : null}
            {libraryError ? (
              <div className="library-state library-state--error">
                {libraryError}
              </div>
            ) : null}

            {!libraryLoading && !libraryError ? (
              savedGraphs.length ? (
                <div className="saved-grid">
                  {savedGraphs.map((graphItem) => {
                    const heading = {
                      chapter:
                        graphItem.title ||
                        parseRoadmapHeading(graphItem.user_prompt).chapter,
                      topics: graphItem.topics_used?.length
                        ? graphItem.topics_used
                        : parseRoadmapHeading(graphItem.user_prompt).topics,
                    };

                    return (
                      <div
                        key={graphItem.id}
                        role="button"
                        tabIndex={0}
                        className={`saved-card ${activeGraphId === graphItem.id ? "saved-card--active" : ""}`}
                        onClick={() => openSavedGraph(graphItem.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openSavedGraph(graphItem.id);
                          }
                        }}
                      >
                        <button
                          type="button"
                          className="saved-card__delete"
                          aria-label="Delete saved graph"
                          disabled={deletingGraphId === graphItem.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDeleteGraph(graphItem.id);
                          }}
                        >
                          x
                        </button>
                        <span className="saved-card__subject">
                          {graphItem.subject}
                        </span>
                        <strong className="saved-card__chapter">
                          {heading.chapter || graphItem.title}
                        </strong>
                        {heading.topics.length ? (
                          <p className="saved-card__topics">
                            {heading.topics.join(", ")}
                          </p>
                        ) : (
                          <div className="saved-card__spacer" />
                        )}
                        <div className="saved-card__meta">
                          <span>{graphItem.node_count} nodes</span>
                          <span>{graphItem.edge_count} links</span>
                        </div>
                        <div className="saved-card__footer">
                          <span>{formatDateTime(graphItem.created_at)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="library-state">
                  No saved graphs yet for {subject.name}.
                </div>
              )
            ) : null}
          </div>
        </section>
      </div>

      <style jsx>{`
        ${commonStyles}
        .builder-shell {
          max-width: 1360px;
          margin: 0 auto;
          padding: 22px 18px 40px;
          display: grid;
          grid-template-columns: minmax(360px, 460px) minmax(0, 1fr);
          gap: 18px;
        }
        .composer-panel,
        .visual-panel {
          position: relative;
          overflow: hidden;
          border-radius: 30px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: linear-gradient(
            180deg,
            rgba(12, 16, 33, 0.96),
            rgba(6, 9, 18, 0.98)
          );
          box-shadow: 0 24px 72px rgba(0, 0, 0, 0.3);
        }
        .composer-panel {
          padding: 22px;
        }
        .visual-panel {
          padding: 20px;
        }
        .panel-head,
        .graph-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .eyebrow {
          font-size: 10px;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: #6f86c7;
          margin-bottom: 8px;
        }
        h1 {
          font-size: 34px;
          line-height: 1.02;
          max-width: 12ch;
        }
        h2 {
          font-size: 28px;
          line-height: 1.08;
        }
        .ghost-btn,
        .inline-btn {
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.03);
          color: #d7def8;
          border-radius: 999px;
          padding: 10px 14px;
          font-weight: 700;
          cursor: pointer;
        }
        .inline-btn {
          padding: 0;
          border: none;
          background: none;
          color: #9fc3ff;
        }
        .subject-chip {
          padding: 9px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.03);
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
        }
        .option-grid {
          display: grid;
          gap: 16px;
          margin-top: 22px;
        }
        .option-card {
          border-radius: 24px;
          padding: 18px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .option-card--text {
          background:
            radial-gradient(
              circle at top right,
              rgba(126, 162, 255, 0.14),
              transparent 32%
            ),
            rgba(255, 255, 255, 0.03);
        }
        .option-card--image {
          background:
            radial-gradient(
              circle at bottom right,
              rgba(89, 240, 194, 0.12),
              transparent 28%
            ),
            rgba(255, 255, 255, 0.03);
        }
        .option-top {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 14px;
        }
        .option-tag {
          display: inline-flex;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          font-size: 11px;
          font-weight: 800;
          color: #f4f6ff;
        }
        .option-label {
          font-size: 15px;
          font-weight: 800;
          color: #cdd7fa;
        }
        textarea {
          width: 100%;
          min-height: 210px;
          resize: vertical;
          border-radius: 20px;
          padding: 18px;
          background: #080d1d;
          color: #f8faff;
          border: 1px solid rgba(255, 255, 255, 0.08);
          font: inherit;
          line-height: 1.65;
          outline: none;
        }
        textarea:focus {
          border-color: rgba(126, 162, 255, 0.42);
          box-shadow: 0 0 0 4px rgba(126, 162, 255, 0.09);
        }
        .upload-shell {
          min-height: 210px;
          border-radius: 20px;
          border: 1px dashed rgba(255, 255, 255, 0.18);
          background: #080d1d;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          overflow: hidden;
        }
        .upload-copy {
          padding: 24px;
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-width: 30ch;
        }
        .upload-copy strong {
          font-size: 16px;
        }
        .upload-copy span {
          font-size: 13px;
          color: #8e98bc;
          line-height: 1.6;
        }
        .preview-image {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .input-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: 12px;
          font-size: 12px;
          color: #8893b8;
        }
        .action-row {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 18px;
        }
        .primary-btn {
          border: none;
          border-radius: 18px;
          padding: 16px 20px;
          background: linear-gradient(135deg, ${subject.accent}, #f8fbff);
          color: #071019;
          font-weight: 900;
          font-size: 15px;
          cursor: pointer;
          box-shadow: 0 16px 34px ${subject.glow};
        }
        .primary-btn:disabled {
          opacity: 0.7;
          cursor: progress;
        }
        .helper-copy {
          font-size: 12px;
          color: #7f8ab0;
          line-height: 1.6;
        }
        .error-box {
          margin-top: 14px;
          border-radius: 18px;
          padding: 14px 16px;
          background: rgba(255, 92, 92, 0.08);
          border: 1px solid rgba(255, 92, 92, 0.2);
          color: #ffb6b6;
          font-size: 13px;
        }
        .library-panel {
          padding: 18px;
          border-radius: 24px;
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid rgba(255, 255, 255, 0.07);
        }
        .library-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }
        .library-count {
          min-width: 42px;
          height: 42px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.08),
            rgba(255, 255, 255, 0.03)
          );
          border: 1px solid rgba(255, 255, 255, 0.08);
          font-size: 14px;
          font-weight: 900;
          color: #f6f8ff;
        }
        .saved-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
        }
        .saved-card {
          position: relative;
          aspect-ratio: 1/1;
          border-radius: 22px;
          padding: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          text-align: left;
          cursor: pointer;
          background:
            radial-gradient(
              circle at top right,
              rgba(126, 162, 255, 0.16),
              transparent 30%
            ),
            linear-gradient(
              180deg,
              rgba(16, 22, 46, 0.96),
              rgba(8, 11, 23, 0.98)
            );
          color: #eef2ff;
          display: flex;
          flex-direction: column;
          gap: 10px;
          transition:
            transform 0.18s ease,
            border-color 0.18s ease,
            box-shadow 0.18s ease;
        }
        .saved-card:hover {
          transform: translateY(-4px);
          border-color: rgba(255, 255, 255, 0.16);
          box-shadow: 0 18px 44px rgba(0, 0, 0, 0.24);
        }
        .saved-card:focus-visible {
          outline: 2px solid ${subject.accent};
          outline-offset: 2px;
        }
        .saved-card--active {
          border-color: ${subject.accent};
          box-shadow:
            0 0 0 1px ${subject.accent} inset,
            0 18px 40px ${subject.glow};
        }
        .saved-card__delete {
          position: absolute;
          top: 12px;
          right: 12px;
          width: 30px;
          height: 30px;
          border: none;
          border-radius: 10px;
          background: rgba(9, 13, 28, 0.78);
          color: #f6f8ff;
          cursor: pointer;
          font-size: 16px;
          line-height: 1;
          z-index: 2;
        }
        .saved-card__delete:disabled {
          opacity: 0.55;
          cursor: wait;
        }
        .saved-card__subject {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #9ccfff;
        }
        .saved-card__chapter {
          font-size: 18px;
          line-height: 1.25;
          font-weight: 800;
        }
        .saved-card__topics {
          flex: 1;
          font-size: 12px;
          line-height: 1.55;
          color: #9aa7cf;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 4;
          -webkit-box-orient: vertical;
        }
        .saved-card__spacer {
          flex: 1;
        }
        .saved-card__meta,
        .saved-card__footer {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          font-size: 11px;
          color: #d8def7;
        }
        .saved-card__footer {
          color: #7f8bb2;
        }
        .library-state {
          border-radius: 18px;
          padding: 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          font-size: 13px;
          color: #97a4cb;
        }
        .library-state--error {
          background: rgba(255, 92, 92, 0.08);
          border-color: rgba(255, 92, 92, 0.2);
          color: #ffb6b6;
        }
        @media (max-width: 1100px) {
          .builder-shell {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 760px) {
          .builder-shell {
            padding: 16px 14px 30px;
          }
          .panel-head,
          .graph-header {
            flex-direction: column;
          }
          h1 {
            font-size: 28px;
          }
          h2 {
            font-size: 24px;
          }
        }
      `}</style>
    </div>
  );
}

function FullscreenGraphScreen({ graphData, subject, onBack }) {
  const router = useRouter();
  const [graphState, setGraphState] = useState(graphData);
  const [notesIndex, setNotesIndex] = useState([]);
  const [activeNodeId, setActiveNodeId] = useState("");
  const [panelMessage, setPanelMessage] = useState("");
  const [nodeActionPending, setNodeActionPending] = useState(false);
  const [noteChoices, setNoteChoices] = useState([]);
  const [resetGraphViewTick, setResetGraphViewTick] = useState(0);

  useEffect(() => {
    setGraphState(graphData);
  }, [graphData]);

  useEffect(() => {
    let cancelled = false;

    fetchNotesIndex()
      .then((data) => {
        if (!cancelled) setNotesIndex(data || []);
      })
      .catch(() => {
        if (!cancelled) setNotesIndex([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const scene = useMemo(
    () => buildGraphScene(graphState?.graph || {}),
    [graphState],
  );
  const graphHeading = useMemo(
    () => ({
      chapter:
        graphState?.title ||
        parseRoadmapHeading(graphState?.user_prompt || "").chapter ||
        "Knowledge Constellation",
      topics: graphState?.topics_used?.length
        ? graphState.topics_used
        : parseRoadmapHeading(graphState?.user_prompt || "").topics,
    }),
    [graphState?.title, graphState?.topics_used, graphState?.user_prompt],
  );
  const nodeStateMap = useMemo(() => {
    const entries = (graphState?.nodes || []).map((node) => [node.label, node]);
    return Object.fromEntries(entries);
  }, [graphState]);
  const activeNode =
    scene.nodes.find((node) => node.id === activeNodeId) || null;
  const activeNodeState = activeNode
    ? nodeStateMap?.[activeNode.label] || {}
    : {};
  const activeNodeNotes = useMemo(
    () => (activeNode ? findNotesForNode(notesIndex, activeNode.label) : []),
    [activeNode, notesIndex],
  );

  useEffect(() => {
    setNoteChoices([]);
    setPanelMessage("");
  }, [activeNodeId]);

  async function handleNodeStatusChange(nextDone) {
    if (!graphState?.id || !activeNode) return;
    setNodeActionPending(true);
    setPanelMessage("");

    try {
      const payload = await updateTopicNodeStatus(
        graphState.id,
        activeNode.label,
        nextDone,
      );
      setGraphState((current) => ({
        ...current,
        nodes: payload.nodes || current?.nodes || [],
      }));
    } catch (err) {
      setPanelMessage(err.message || "Unable to update topic state.");
    } finally {
      setNodeActionPending(false);
    }
  }

  function handleViewNotes() {
    if (!activeNode) return;
    if (!activeNodeState?.is_in_uploaded_notes) {
      setPanelMessage("Related notes not present for this topic yet.");
      return;
    }

    if (!activeNodeNotes.length) {
      setPanelMessage("Related notes not present for this topic yet.");
      return;
    }

    if (activeNodeNotes.length === 1) {
      const note = activeNodeNotes[0];
      router.push(
        `/explanation?noteId=${note.note_id}&concept=${encodeURIComponent(activeNode.label)}`,
      );
      return;
    }

    setNoteChoices(activeNodeNotes);
    setPanelMessage("Multiple related notes found. Choose a note to open.");
  }

  function openNodeNote(noteId) {
    if (!noteId || !activeNode) return;
    router.push(
      `/explanation?noteId=${noteId}&concept=${encodeURIComponent(activeNode.label)}`,
    );
  }

  function handleGenerateExplanation() {
    if (!activeNode) return;
    const targetSubject = subject?.name || graphState?.subject || "General";
    const prompt =
      `Create a detailed, student-friendly explanation of the topic "${activeNode.label}". ` +
      `Include intuition, a clear definition, step-by-step reasoning where relevant, worked examples, common mistakes, and revision-ready takeaways. ` +
      `Most importantly, make sure this exact topic appears in the "term" key (or "term_en" when bilingual output is used) of the first concept in the concepts list.`;
    router.push(
      `/create-explanation?subject=${encodeURIComponent(targetSubject)}&prompt=${encodeURIComponent(prompt)}`,
    );
  }

  return (
    <div className="screen graph-screen">
      <header className="graph-screen__hdr">
        <button className="back-btn" onClick={onBack} aria-label="Go back">
          &larr;
        </button>
      </header>

      <div className="graph-screen__body">
        <div className="graph-screen__hero">
          <div>
            <p className="eyebrow">Topic Graph</p>
            <h1>
              {graphHeading.chapter ||
                graphState?.title ||
                "Knowledge Constellation"}
            </h1>
            {graphHeading.topics.length ? (
              <p className="graph-screen__topics">
                {graphHeading.topics.join(", ")}
              </p>
            ) : null}
          </div>
          <div className="graph-screen__stats">
            <span>{subject?.name || graphState?.subject || "General"}</span>
            <span>{scene.stats.topicCount} topics</span>
            <span>{scene.stats.connectionCount} links</span>
            <span>{scene.stats.depthCount} layers</span>
          </div>
        </div>

        <div className="legend-card">
          <p className="graph-screen__subcopy graph-screen__subcopy--legend">
            Drag to slide, use the zoom controls as needed, and open a topic
            card to inspect and act on a node.
          </p>
          <div className="legend-actions">
            <button
              type="button"
              className="legend-reset"
              onClick={() => setResetGraphViewTick((value) => value + 1)}
            >
              Restore default view
            </button>
            <div className="legend-list">
              <div className="legend-item">
                <span className="legend-swatch legend-swatch--done" />
                <span>Marked done</span>
              </div>
              <div className="legend-item">
                <span className="legend-swatch legend-swatch--notes" />
                <span>Found in uploaded notes</span>
              </div>
              <div className="legend-item">
                <span className="legend-swatch legend-swatch--new" />
                <span>Not yet found in uploaded notes</span>
              </div>
            </div>
          </div>
        </div>

        <div className="graph-layout">
          <GraphViewport
            scene={scene}
            accent={subject?.accent || "#7ea2ff"}
            glow={subject?.glow || "rgba(126,162,255,0.34)"}
            activeNodeId={activeNodeId}
            onSelectNode={setActiveNodeId}
            fullScreen
            nodeStateMap={nodeStateMap}
            onCloseNode={() => {
              setActiveNodeId("");
              setPanelMessage("");
            }}
            resetSignal={resetGraphViewTick}
            panelContent={
              activeNode ? (
                <div className="node-tab">
                  <div className="node-tab__head">
                    <div>
                      <p className="eyebrow">Topic Focus</p>
                      <h3>{activeNode.label}</h3>
                    </div>
                    <button
                      type="button"
                      className="node-tab__close"
                      onClick={() => setActiveNodeId("")}
                      aria-label="Close topic panel"
                    >
                      x
                    </button>
                  </div>

                  <p className="node-tab__copy">
                    Layer {activeNode.level + 1}.{" "}
                    {activeNode.prerequisites.length || 0} prerequisite
                    {activeNode.prerequisites.length === 1 ? "" : "s"},{" "}
                    {activeNode.dependents.length || 0} follow-up topic
                    {activeNode.dependents.length === 1 ? "" : "s"}.
                  </p>

                  <div className="node-tab__actions">
                    <button
                      type="button"
                      className="node-tab__btn node-tab__btn--primary"
                      onClick={handleViewNotes}
                      disabled={!activeNodeState?.is_in_uploaded_notes}
                    >
                      View Notes
                    </button>
                    <button
                      type="button"
                      className="node-tab__btn"
                      onClick={handleGenerateExplanation}
                    >
                      Generate new explanation
                    </button>
                    <button
                      type="button"
                      className={`node-tab__toggle ${activeNodeState?.is_marked_done ? "node-tab__toggle--done" : "node-tab__toggle--unread"}`}
                      onClick={() =>
                        handleNodeStatusChange(!activeNodeState?.is_marked_done)
                      }
                      disabled={nodeActionPending}
                      aria-pressed={Boolean(activeNodeState?.is_marked_done)}
                      aria-label={`Toggle topic status. Current state: ${activeNodeState?.is_marked_done ? "Done" : "Unread"}`}
                    >
                      <span
                        className="node-tab__toggle-track"
                        aria-hidden="true"
                      />
                      <span className="node-tab__toggle-label">Unread</span>
                      <span className="node-tab__toggle-label">Done</span>
                    </button>
                  </div>

                  {noteChoices.length ? (
                    <div className="node-tab__note-list">
                      {noteChoices.map((note) => (
                        <button
                          key={note.note_id}
                          type="button"
                          className="node-tab__note-link"
                          onClick={() => openNodeNote(note.note_id)}
                        >
                          {note.file_name || note.note_id}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {panelMessage ? (
                    <p className="node-tab__message">{panelMessage}</p>
                  ) : null}
                  {!activeNodeState?.is_in_uploaded_notes ? (
                    <p className="node-tab__hint">
                      Related notes not present for this topic yet.
                    </p>
                  ) : null}
                </div>
              ) : null
            }
          />
        </div>
      </div>

      <style jsx>{`
        ${commonStyles}
        .graph-screen {
          padding-bottom: 24px;
        }
        .graph-screen__hdr {
          position: sticky;
          top: 0;
          z-index: 45;
          padding: 16px;
          background: linear-gradient(
            180deg,
            rgba(5, 8, 18, 0.92),
            rgba(5, 8, 18, 0.45),
            transparent
          );
        }
        .graph-screen__body {
          padding: 4px 18px 28px;
          max-width: 1600px;
          margin: 0 auto;
        }
        .graph-screen__hero {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 18px;
        }
        .graph-screen__hero h1 {
          font-size: 38px;
          line-height: 1.02;
          max-width: 14ch;
        }
        .graph-screen__topics {
          font-size: 14px;
          line-height: 1.6;
          font-weight: 500;
          color: #aeb8d8;
          max-width: 72ch;
          margin-top: 10px;
        }
        .graph-screen__subcopy {
          font-size: 14px;
          line-height: 1.7;
          color: #93a0c9;
          max-width: 72ch;
          margin-top: 10px;
        }
        .graph-screen__subcopy code {
          font-family: "JetBrains Mono", monospace;
          background: rgba(255, 255, 255, 0.05);
          padding: 2px 6px;
          border-radius: 999px;
        }
        .graph-screen__subcopy--legend {
          margin: 0;
        }
        .graph-screen__stats {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: flex-end;
        }
        .graph-screen__stats span {
          padding: 10px 13px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          font-size: 12px;
          color: #dbe2ff;
        }
        .graph-layout {
          display: block;
        }
        .legend-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 16px;
          padding: 16px 18px;
          border-radius: 22px;
          background: linear-gradient(
            180deg,
            rgba(18, 23, 44, 0.92),
            rgba(8, 11, 22, 0.96)
          );
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.22);
        }
        .legend-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .legend-reset {
          min-height: 44px;
          padding: 0 16px;
          border-radius: 14px;
          border: 1px solid rgba(126, 162, 255, 0.3);
          background: linear-gradient(
            135deg,
            rgba(126, 162, 255, 0.2),
            rgba(71, 103, 217, 0.12)
          );
          color: #ecf2ff;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
        }
        .legend-list {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 13px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
          font-size: 13px;
          color: #dce5ff;
        }
        .legend-swatch {
          width: 14px;
          height: 14px;
          border-radius: 999px;
          display: inline-block;
          box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.05);
        }
        .legend-swatch--done {
          background: #37e6bf;
        }
        .legend-swatch--notes {
          background: #ffb95e;
        }
        .legend-swatch--new {
          background: #8f7cff;
        }
        .node-tab {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .node-tab__head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }
        .node-tab__head h3 {
          font-size: 20px;
          line-height: 1.18;
          margin-top: 4px;
        }
        .node-tab__close {
          width: 34px;
          height: 34px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.06);
          color: #f6f8ff;
          cursor: pointer;
          font-size: 20px;
          line-height: 1;
        }
        .node-tab__copy {
          font-size: 13px;
          line-height: 1.65;
          color: #aeb8d8;
          margin: 0;
        }
        .node-tab__actions {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .node-tab__btn {
          min-height: 42px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.05);
          color: #edf2ff;
          font-weight: 700;
          cursor: pointer;
          padding: 10px 12px;
        }
        .node-tab__btn:disabled {
          opacity: 0.58;
          cursor: wait;
        }
        .node-tab__btn--primary {
          background: linear-gradient(
            135deg,
            rgba(126, 162, 255, 0.26),
            rgba(83, 118, 255, 0.18)
          );
          border-color: rgba(126, 162, 255, 0.38);
        }
        .node-tab__toggle {
          position: relative;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          align-items: center;
          min-height: 50px;
          padding: 4px;
          grid-column: 1 / -1;
          justify-self: center;
          width: min(100%, 250px);
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.04);
          cursor: pointer;
          overflow: hidden;
          text-align: center;
        }
        .node-tab__toggle:disabled {
          opacity: 0.58;
          cursor: wait;
        }
        .node-tab__toggle-track {
          position: absolute;
          top: 4px;
          bottom: 4px;
          left: 4px;
          width: calc(50% - 4px);
          border-radius: 12px;
          transition:
            transform 0.2s ease,
            background 0.2s ease,
            box-shadow 0.2s ease;
          background: linear-gradient(
            135deg,
            rgba(255, 185, 94, 0.28),
            rgba(155, 103, 34, 0.18)
          );
          box-shadow: 0 10px 26px rgba(155, 103, 34, 0.16);
        }
        .node-tab__toggle--done .node-tab__toggle-track {
          transform: translateX(100%);
          background: linear-gradient(
            135deg,
            rgba(55, 230, 191, 0.28),
            rgba(25, 171, 138, 0.18)
          );
          box-shadow: 0 10px 26px rgba(24, 122, 100, 0.18);
        }
        .node-tab__toggle-label {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 42px;
          color: #d8e2ff;
          font-weight: 800;
        }
        .node-tab__toggle--done .node-tab__toggle-label:first-of-type {
          color: #f2fffb;
        }
        .node-tab__toggle--unread .node-tab__toggle-label:last-of-type {
          color: #fff6e7;
        }
        .node-tab__message {
          font-size: 12px;
          color: #ffb7b7;
          margin: 0;
        }
        .node-tab__hint {
          font-size: 12px;
          color: #97a4cb;
          margin: 0;
        }
        .node-tab__note-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .node-tab__note-link {
          min-height: 36px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.05);
          color: #edf2ff;
          font-weight: 700;
          cursor: pointer;
          padding: 8px 12px;
        }
        @media (max-width: 900px) {
          .graph-screen__hero {
            flex-direction: column;
          }
          .graph-screen__hero h1 {
            font-size: 30px;
          }
          .legend-card {
            align-items: flex-start;
            flex-direction: column;
          }
          .legend-actions {
            justify-content: flex-start;
          }
          .node-tab__actions {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

function GraphViewport({
  scene,
  accent,
  glow,
  activeNodeId,
  onSelectNode,
  onCloseNode,
  panelContent,
  nodeStateMap,
  resetSignal = 0,
  fullScreen = false,
}) {
  const viewportRef = useRef(null);
  const dragRef = useRef(null);
  const touchPointsRef = useRef(new Map());
  const [size, setSize] = useState({ width: 900, height: 560 });
  const [view, setView] = useState(() =>
    createFittedView(scene.nodes, 900, 560),
  );
  const [hoveredNodeId, setHoveredNodeId] = useState("");

  useEffect(() => {
    const element = viewportRef.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect;
      if (!next) return;
      setSize({
        width: Math.max(next.width, 320),
        height: Math.max(next.height, 420),
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!scene.nodes.length) return;
    setView(createFittedView(scene.nodes, size.width, size.height));
  }, [scene.nodes, size.height, size.width]);

  const fittedView = useMemo(
    () =>
      scene.nodes.length
        ? createFittedView(scene.nodes, size.width, size.height)
        : createFittedView([], size.width, size.height),
    [scene.nodes, size.height, size.width],
  );

  useEffect(() => {
    setView(fittedView);
  }, [fittedView, resetSignal]);

  const projectedNodes = useMemo(() => {
    return scene.nodes
      .map((node) => {
        const projected = projectPoint(node, view, size.width, size.height);
        return { ...node, ...projected };
      })
      .sort((a, b) => a.z - b.z);
  }, [scene.nodes, size.height, size.width, view]);

  const projectedMap = useMemo(
    () => Object.fromEntries(projectedNodes.map((node) => [node.id, node])),
    [projectedNodes],
  );

  const projectedLinks = useMemo(() => {
    return scene.links
      .map((link) => {
        const source = projectedMap[link.source];
        const target = projectedMap[link.target];
        if (!source || !target) return null;
        return {
          ...link,
          path: screenPath(source, target, link),
          opacity: Math.max(
            0.2,
            Math.min((source.depth + target.depth) / 2, 1.45) / 1.45,
          ),
          isHighlighted: hoveredNodeId
            ? link.source === hoveredNodeId || link.target === hoveredNodeId
            : false,
        };
      })
      .filter(Boolean);
  }, [hoveredNodeId, projectedMap, scene.links]);

  const activeProjectedNode = activeNodeId ? projectedMap[activeNodeId] : null;
  const hoveredProjectedNode = hoveredNodeId
    ? projectedMap[hoveredNodeId]
    : null;
  const hasOpenPanel = Boolean(activeProjectedNode && panelContent);
  const zoomPercent = Math.max(
    20,
    Math.round((view.scale / Math.max(fittedView.scale, 0.01)) * 100),
  );

  function clampScale(nextScale) {
    return Math.min(3.1, Math.max(0.2, nextScale));
  }

  function handlePointerDown(event) {
    if (event.target.closest(".zoom-pill, .graph-node, .node-panel")) return;
    if (hasOpenPanel) return;
    if (event.pointerType === "touch") {
      touchPointsRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      if (touchPointsRef.current.size === 2) {
        const points = [...touchPointsRef.current.values()];
        const distance = Math.hypot(
          points[0].x - points[1].x,
          points[0].y - points[1].y,
        );
        const midpoint = {
          x: (points[0].x + points[1].x) / 2,
          y: (points[0].y + points[1].y) / 2,
        };
        dragRef.current = {
          mode: "pinch",
          distance,
          midpoint,
        };
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    dragRef.current = {
      mode: "pan",
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event) {
    if (hasOpenPanel) return;
    if (event.pointerType === "touch") {
      if (!touchPointsRef.current.has(event.pointerId)) return;
      touchPointsRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      if (touchPointsRef.current.size === 2) {
        const points = [...touchPointsRef.current.values()];
        const distance = Math.hypot(
          points[0].x - points[1].x,
          points[0].y - points[1].y,
        );
        const midpoint = {
          x: (points[0].x + points[1].x) / 2,
          y: (points[0].y + points[1].y) / 2,
        };

        setView((prev) => {
          const prevDistance = dragRef.current?.distance || distance;
          const prevMidpoint = dragRef.current?.midpoint || midpoint;
          const zoomRatio = prevDistance ? distance / prevDistance : 1;
          dragRef.current = { mode: "pinch", distance, midpoint };

          return {
            ...prev,
            scale: clampScale(prev.scale * zoomRatio),
            panX: prev.panX + (midpoint.x - prevMidpoint.x),
            panY: prev.panY + (midpoint.y - prevMidpoint.y),
          };
        });
      }
      return;
    }

    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId)
      return;

    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;

    dragRef.current.x = event.clientX;
    dragRef.current.y = event.clientY;

    setView((prev) => {
      return {
        ...prev,
        panX: prev.panX + dx,
        panY: prev.panY + dy,
      };
    });
  }

  function handlePointerUp(event) {
    if (event.pointerType === "touch") {
      touchPointsRef.current.delete(event.pointerId);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (
        touchPointsRef.current.size < 2 &&
        dragRef.current?.mode === "pinch"
      ) {
        dragRef.current = null;
      }
      return;
    }

    if (dragRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      dragRef.current = null;
    }
  }

  function handleWheel(event) {
    if (hasOpenPanel) return;
    if (!event.ctrlKey) return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.06 : 0.06;
    setView((prev) => ({ ...prev, scale: clampScale(prev.scale + delta) }));
  }

  return (
    <div className="viewport-wrap">
      <div
        ref={viewportRef}
        className="viewport"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onClick={() => {
          if (hasOpenPanel) onCloseNode?.();
        }}
      >
        <div className="zoom-pill">
          <button
            type="button"
            aria-label="Zoom out"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              setView((prev) => ({
                ...prev,
                scale: clampScale(prev.scale - 0.08),
              }));
            }}
          >
            -
          </button>
          <span>{zoomPercent}%</span>
          <button
            type="button"
            aria-label="Restore default view"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              setView(fittedView);
            }}
          >
            R
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              setView((prev) => ({
                ...prev,
                scale: clampScale(prev.scale + 0.08),
              }));
            }}
          >
            +
          </button>
        </div>
        <div className="star star-a" />
        <div className="star star-b" />
        <div className="star star-c" />
        <div
          className="glow-field"
          style={{
            background: `radial-gradient(circle, ${glow}, transparent 64%)`,
          }}
        />
        {hasOpenPanel ? <div className="viewport-fog" /> : null}

        <svg
          className={`link-layer ${hasOpenPanel ? "link-layer--muted" : ""}`}
          viewBox={`0 0 ${size.width} ${size.height}`}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient
              id="constellation-link-gradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#5d7bff" />
              <stop offset="50%" stopColor={accent} />
              <stop offset="100%" stopColor="#f4fbff" />
            </linearGradient>
          </defs>

          {projectedLinks.map((link) => (
            <g key={link.id}>
              <path
                d={link.path}
                fill="none"
                stroke="url(#constellation-link-gradient)"
                strokeWidth={link.isHighlighted ? "4.4" : "2.35"}
                strokeOpacity={link.isHighlighted ? "0.98" : link.opacity}
              />
              <path
                d={link.path}
                fill="none"
                stroke={link.isHighlighted ? "#f9fbff" : "#f4fbff"}
                strokeWidth={link.isHighlighted ? "1.8" : "0.8"}
                strokeOpacity={
                  link.isHighlighted
                    ? "0.9"
                    : Math.max(0.18, link.opacity * 0.55)
                }
                strokeDasharray={link.isHighlighted ? "8 10" : "7 12"}
              >
                <animate
                  attributeName="stroke-dashoffset"
                  from="19"
                  to="0"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
              </path>
            </g>
          ))}
        </svg>

        {projectedNodes.map((node) => {
          const selected = node.id === activeNodeId;
          const sizePx = Math.max(
            56,
            Math.min(node.size * node.depth * 0.78, 132),
          );
          const state = nodeStateMap?.[node.label] || {};
          const borderColor = state.is_marked_done
            ? "#37e6bf"
            : state.is_in_uploaded_notes
              ? "#ffb95e"
              : "#8f7cff";

          return (
            <button
              key={node.id}
              type="button"
              className={`graph-node ${selected ? "graph-node--selected" : ""} ${hasOpenPanel && !selected ? "graph-node--dimmed" : ""}`}
              style={{
                left: `${node.x}px`,
                top: `${node.y}px`,
                width: `${sizePx}px`,
                minHeight: `${sizePx * 0.66}px`,
                boxShadow: selected
                  ? `0 0 0 1px ${borderColor}, 0 18px 50px ${glow}`
                  : `0 14px 34px rgba(0,0,0,0.35)`,
                borderColor,
              }}
              onClick={(event) => {
                event.stopPropagation();
                onSelectNode(node.id);
              }}
              onMouseEnter={() => setHoveredNodeId(node.id)}
              onMouseLeave={() =>
                setHoveredNodeId((current) =>
                  current === node.id ? "" : current,
                )
              }
            >
              <span className="graph-node__label">
                {truncateNodeLabel(node.label, sizePx)}
              </span>
              <span className="graph-node__meta">L{node.level + 1}</span>
            </button>
          );
        })}

        {hoveredProjectedNode ? (
          <div
            className="graph-tooltip"
            style={{
              left: `${Math.max(18, Math.min(hoveredProjectedNode.x + 18, size.width - 250))}px`,
              top: `${Math.max(18, hoveredProjectedNode.y - 48)}px`,
            }}
          >
            {hoveredProjectedNode.label}
          </div>
        ) : null}

        {hasOpenPanel ? (
          <div
            className="node-panel"
            style={{
              left: `${Math.max(18, Math.min(activeProjectedNode.x + 78, size.width - 326))}px`,
              top: `${Math.max(18, Math.min(activeProjectedNode.y - 34, size.height - 248))}px`,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            {panelContent}
          </div>
        ) : null}
      </div>

      <style jsx>{`
        .viewport-wrap {
          margin-top: 12px;
        }
        .viewport {
          position: relative;
          height: ${fullScreen ? "68vh" : "560px"};
          min-height: ${fullScreen ? "640px" : "500px"};
          border-radius: 28px;
          overflow: hidden;
          cursor: grab;
          touch-action: pan-y;
          background:
            radial-gradient(
              circle at 15% 20%,
              rgba(93, 123, 255, 0.18),
              transparent 22%
            ),
            radial-gradient(
              circle at 82% 24%,
              rgba(255, 255, 255, 0.08),
              transparent 18%
            ),
            radial-gradient(
              circle at 70% 80%,
              rgba(92, 246, 214, 0.13),
              transparent 20%
            ),
            linear-gradient(180deg, rgba(5, 8, 19, 1), rgba(7, 10, 20, 0.96));
          border: 1px solid rgba(255, 255, 255, 0.06);
        }
        .viewport:active {
          cursor: grabbing;
        }
        .zoom-pill {
          position: absolute;
          top: 18px;
          right: 18px;
          z-index: 6;
          display: flex;
          align-items: center;
          border-radius: 999px;
          background: rgba(9, 14, 28, 0.78);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          overflow: hidden;
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
        }
        .zoom-pill button {
          width: 42px;
          height: 42px;
          border: none;
          background: transparent;
          color: #eef3ff;
          font-size: 20px;
          font-weight: 800;
          cursor: pointer;
        }
        .zoom-pill span {
          min-width: 70px;
          text-align: center;
          font-size: 13px;
          font-weight: 800;
          color: #dce6ff;
          padding: 0 8px;
        }
        .link-layer,
        .glow-field,
        .star,
        .viewport-fog {
          position: absolute;
          inset: 0;
        }
        .link-layer,
        .star {
          pointer-events: none;
        }
        .glow-field {
          pointer-events: none;
          mix-blend-mode: screen;
          opacity: 0.75;
        }
        .viewport-fog {
          background: rgba(5, 8, 18, 0.2);
          backdrop-filter: blur(10px);
          z-index: 2;
          pointer-events: none;
        }
        .star::before,
        .star::after {
          content: "";
          position: absolute;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.85);
        }
        .star-a::before {
          width: 3px;
          height: 3px;
          left: 16%;
          top: 22%;
          box-shadow:
            220px 110px 0 rgba(255, 255, 255, 0.65),
            460px 46px 0 rgba(255, 255, 255, 0.55),
            720px 180px 0 rgba(255, 255, 255, 0.7);
        }
        .star-b::before {
          width: 2px;
          height: 2px;
          left: 10%;
          top: 65%;
          box-shadow:
            180px -210px 0 rgba(255, 255, 255, 0.45),
            540px -120px 0 rgba(255, 255, 255, 0.65),
            860px -200px 0 rgba(255, 255, 255, 0.35);
        }
        .star-c::before {
          width: 2px;
          height: 2px;
          left: 42%;
          top: 78%;
          box-shadow:
            110px -260px 0 rgba(255, 255, 255, 0.45),
            320px -90px 0 rgba(255, 255, 255, 0.32),
            540px -290px 0 rgba(255, 255, 255, 0.68);
        }
        .link-layer--muted {
          filter: blur(1.2px);
          opacity: 0.26;
        }
        .graph-node {
          position: absolute;
          transform: translate(-50%, -50%);
          border-radius: 24px;
          padding: 14px 14px 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: linear-gradient(
            180deg,
            rgba(25, 33, 62, 0.94),
            rgba(10, 14, 28, 0.96)
          );
          color: #f5f8ff;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 10px;
          text-align: left;
          cursor: pointer;
          backdrop-filter: blur(12px);
          transition:
            transform 0.16s ease,
            border-color 0.16s ease,
            filter 0.16s ease,
            opacity 0.16s ease;
          z-index: 3;
        }
        .graph-node:hover {
          transform: translate(-50%, -50%) scale(1.03);
          border-color: rgba(255, 255, 255, 0.18);
        }
        .graph-node--selected {
          border-color: ${accent};
          background: linear-gradient(
            180deg,
            rgba(22, 34, 66, 0.95),
            rgba(10, 14, 28, 0.97)
          );
        }
        .graph-node--dimmed {
          filter: blur(3px);
          opacity: 0.22;
          pointer-events: none;
        }
        .graph-node__label {
          font-size: 13px;
          font-weight: 800;
          line-height: 1.22;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          word-break: break-word;
        }
        .graph-node__meta {
          font-size: 11px;
          font-weight: 700;
          color: #a7b3d8;
        }
        .graph-tooltip {
          position: absolute;
          z-index: 7;
          max-width: 260px;
          padding: 8px 12px;
          border-radius: 12px;
          pointer-events: none;
          background: rgba(9, 14, 28, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #f5f8ff;
          font-size: 12px;
          font-weight: 700;
          box-shadow: 0 18px 34px rgba(0, 0, 0, 0.28);
          white-space: normal;
          line-height: 1.4;
          word-break: break-word;
        }
        .node-panel {
          position: absolute;
          z-index: 7;
          width: 304px;
          padding: 18px;
          border-radius: 22px;
          background: linear-gradient(
            180deg,
            rgba(18, 24, 46, 0.97),
            rgba(8, 12, 24, 0.98)
          );
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 26px 70px rgba(0, 0, 0, 0.42);
          max-height: calc(100% - 36px);
          overflow-y: auto;
        }
        @media (max-width: 760px) {
          .viewport {
            height: ${fullScreen ? "62vh" : "500px"};
            min-height: ${fullScreen ? "520px" : "500px"};
          }
          .zoom-pill {
            top: 14px;
            right: 14px;
          }
          .zoom-pill button {
            width: 38px;
            height: 38px;
          }
          .zoom-pill span {
            min-width: 60px;
          }
          .node-panel {
            width: min(304px, calc(100% - 24px));
          }
        }
      `}</style>
    </div>
  );
}

const commonStyles = `
  *,*::before,*::after{box-sizing:border-box}
  html,body{margin:0;padding:0}
  .screen{
    min-height:100vh;color:#f8fbff;font-family:'Sora',sans-serif;
    background:
      radial-gradient(circle at 15% 10%, rgba(91,208,255,0.12), transparent 24%),
      radial-gradient(circle at 85% 16%, rgba(199,155,255,0.1), transparent 18%),
      linear-gradient(180deg, #05070f, #090d1b 38%, #060913 100%);
  }
  .hdr{
    display:flex;align-items:center;gap:12px;padding:14px 16px;position:sticky;top:0;z-index:40;
    background:rgba(5,8,18,0.82);backdrop-filter:blur(20px);border-bottom:1px solid rgba(255,255,255,0.06)
  }
  .back-btn{
    width:38px;height:38px;border-radius:12px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);
    color:#e7edff;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0
  }
  .hdr-title{display:block;font-size:16px;font-weight:800}
  .hdr-sub{display:block;font-size:12px;color:#8e98bc;margin-top:2px}
  .body{max-width:1120px;margin:0 auto;padding:28px 16px 40px}
  .section-label{
    display:block;margin-bottom:14px;font-size:10px;font-weight:800;letter-spacing:0.28em;text-transform:uppercase;color:#62739f
  }
`;

export default function ConstellationPage() {
  const [screen, setScreen] = useState("subject");
  const [subject, setSubject] = useState(null);
  const [activeGraph, setActiveGraph] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [graphCounts, setGraphCounts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadSubjectsAndCounts() {
      setLoading(true);
      const subjectMap = new Map(
        getAllSubjects().map((item) => [
          item.name.toLowerCase(),
          buildConstellationSubject(item.name),
        ]),
      );

      try {
        const [savedGraphs, notes] = await Promise.all([
          fetchSavedTopicGraphs().catch(() => []),
          fetchNotesIndex().catch(() => []),
        ]);

        const nextCounts = {};

        (notes || []).forEach((note) => {
          const noteSubject = (note?.subject || "General").trim() || "General";
          if (!subjectMap.has(noteSubject.toLowerCase())) {
            subjectMap.set(
              noteSubject.toLowerCase(),
              buildConstellationSubject(noteSubject),
            );
          }
        });

        (savedGraphs || []).forEach((graph) => {
          const graphSubject =
            (graph?.subject || "General").trim() || "General";
          nextCounts[graphSubject] = (nextCounts[graphSubject] || 0) + 1;
          if (!subjectMap.has(graphSubject.toLowerCase())) {
            subjectMap.set(
              graphSubject.toLowerCase(),
              buildConstellationSubject(graphSubject),
            );
          }
        });

        if (!cancelled) {
          setGraphCounts(nextCounts);
          setSubjects([...subjectMap.values()]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSubjectsAndCounts();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading)
    return (
      <LoadingScreen
        message="Initializing Constellations..."
        subMessage="Fetching your knowledge library"
      />
    );

  function handleAddSubject() {
    const name =
      typeof window !== "undefined" ? window.prompt("Subject name") : "";
    const trimmedName = (name || "").trim();
    if (!trimmedName) return;

    addCustomSubject(trimmedName);
    const nextSubject = buildConstellationSubject(trimmedName);
    setSubjects((current) =>
      current.some(
        (item) => item.name.toLowerCase() === trimmedName.toLowerCase(),
      )
        ? current
        : [...current, nextSubject],
    );
  }

  return (
    <>
      <Head>
        <title>Constellation | GYAANI AI</title>
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&family=JetBrains+Mono:wght@600;700&display=swap"
          rel="stylesheet"
        />
      </Head>

      {screen === "subject" ? (
        <SubjectScreen
          subjects={subjects}
          graphCounts={graphCounts}
          onAddSubject={handleAddSubject}
          onSelect={(nextSubject) => {
            setSubject(nextSubject);
            setScreen("builder");
          }}
        />
      ) : null}

      {screen === "builder" && subject ? (
        <BuilderScreen
          subject={subject}
          onOpenGraph={(graph) => {
            setActiveGraph(graph);
            setScreen("graph");
          }}
          onBack={() => {
            setSubject(null);
            setActiveGraph(null);
            setScreen("subject");
          }}
        />
      ) : null}

      {screen === "graph" && activeGraph ? (
        <FullscreenGraphScreen
          graphData={activeGraph}
          subject={subject}
          onBack={() => setScreen("builder")}
        />
      ) : null}
    </>
  );
}
