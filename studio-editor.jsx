import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";

// ----------------------------- constants -----------------------------

const COLORS = {
  bg: "#2b2b2b",
  panel: "#242424",
  panelHeader: "#333333",
  ribbon: "#333333",
  topbar: "#3b3b3b",
  border: "#1a1a1a",
  text: "#dcdcdc",
  textMuted: "#8a8a8a",
  accent: "#3399ff",
  btn: "#3f3f3f",
  btnHover: "#4c4c4c",
  btnActive: "#0e639c",
  statusBar: "#007acc",
  red: "#e05555",
  green: "#4caf50",
  blue: "#4a90d9",
  defaultPartColor: "#646464", // rgb(100,100,100)
};

const AXIS_COLOR = { x: "#e05555", y: "#4caf50", z: "#4a90d9" };
const AXIS_VEC = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

const MATERIALS = ["Plastic", "Neon", "Metal", "Wood", "Glass"];

let idCounter = 1;
const nextId = () => idCounter++;

// ----------------------------- geometry helpers -----------------------------

function createWedgeGeometry() {
  const geometry = new THREE.BufferGeometry();
  // unit wedge: full height at z=-0.5 (back), tapering to 0 at z=+0.5 (front)
  const vertices = new Float32Array([
    -0.5, -0.5, -0.5, // 0 back-bottom-left
    0.5, -0.5, -0.5, // 1 back-bottom-right
    -0.5, 0.5, -0.5, // 2 back-top-left
    0.5, 0.5, -0.5, // 3 back-top-right
    -0.5, -0.5, 0.5, // 4 front-bottom-left
    0.5, -0.5, 0.5, // 5 front-bottom-right
  ]);
  const indices = [
    0, 1, 5, 0, 5, 4, // bottom
    0, 2, 3, 0, 3, 1, // back
    2, 4, 5, 2, 5, 3, // slanted top
    0, 4, 2, // left tri
    1, 3, 5, // right tri
  ];
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createGeometry(type) {
  switch (type) {
    case "sphere":
      return new THREE.SphereGeometry(0.5, 24, 16);
    case "cylinder":
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
    case "wedge":
      return createWedgeGeometry();
    case "block":
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

function applyMaterialPreset(materialOrArray, presetName, hexColor) {
  const materials = Array.isArray(materialOrArray) ? materialOrArray : [materialOrArray];
  materials.forEach((material) => {
    material.color.set(hexColor);
    material.transparent = false;
    material.opacity = 1;
    material.emissive.set(0x000000);
    material.emissiveIntensity = 1;
    switch (presetName) {
      case "Neon":
        material.roughness = 0.5;
        material.metalness = 0;
        material.emissive.set(hexColor);
        material.emissiveIntensity = 0.7;
        break;
      case "Metal":
        material.roughness = 0.3;
        material.metalness = 0.9;
        break;
      case "Wood":
        material.roughness = 0.95;
        material.metalness = 0;
        break;
      case "Glass":
        material.roughness = 0.05;
        material.metalness = 0;
        material.transparent = true;
        material.opacity = 0.35;
        break;
      case "Plastic":
      default:
        material.roughness = 0.55;
        material.metalness = 0.05;
        break;
    }
    material.needsUpdate = true;
  });
}

// ----------------------------- surface textures -----------------------------
// cached procedural canvas textures, shared (cloned per-use so each part can have its own
// repeat/tiling) and tinted via each material's own .color — so changing a part's color
// still works normally even with a texture applied.

let _studTextureCache = null;
function getStudTexture() {
  if (_studTextureCache) return _studTextureCache;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#d6d6d6";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.27, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#bababa";
  ctx.lineWidth = 2;
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  _studTextureCache = texture;
  return texture;
}

let _gridTextureCache = null;
function getGridTexture() {
  if (_gridTextureCache) return _gridTextureCache;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#c7c7c7";
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, size - 3, size - 3);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  _gridTextureCache = texture;
  return texture;
}

const _faceTextureCache = {};
function getFaceTexture(label) {
  if (_faceTextureCache[label]) return _faceTextureCache[label];
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#c7c7c7";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, size - 4, size - 4);
  ctx.fillStyle = "#8a8a8a";
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, size / 2, size / 2);
  const texture = new THREE.CanvasTexture(canvas);
  _faceTextureCache[label] = texture;
  return texture;
}

const FACE_LABELS = ["Right", "Left", "Top", "Bottom", "Front", "Back"];

// applies Default / Stud / Faces / Grid to a mesh, rebuilding its material(s) as needed
function applySurfaceTexture(mesh, textureType, colorHex, materialPresetName) {
  if (textureType === "faces") {
    const mats = FACE_LABELS.map((label) => {
      const m = new THREE.MeshStandardMaterial({ color: colorHex, map: getFaceTexture(label) });
      applyMaterialPreset(m, materialPresetName || "Plastic", colorHex);
      m.map = getFaceTexture(label);
      m.needsUpdate = true;
      return m;
    });
    mesh.material = mats;
    return;
  }
  const single = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  applyMaterialPreset(single, materialPresetName || "Plastic", colorHex);
  if (textureType === "stud" || textureType === "grid") {
    const tex = (textureType === "stud" ? getStudTexture() : getGridTexture()).clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, Math.round(mesh.scale.x)), Math.max(1, Math.round(mesh.scale.y)));
    single.map = tex;
  } else {
    single.map = null;
  }
  single.needsUpdate = true;
  mesh.material = single;
}

function degToRad(d) {
  return (d * Math.PI) / 180;
}
function radToDeg(r) {
  return (r * 180) / Math.PI;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}

// ----------------------------- generic explorer-tree helpers -----------------------------
// nodes: [{ id, type: 'folder'|'guipart', name, children: [] }, ...] — any node can hold children.

function treeInsert(nodes, parentId, newNode) {
  if (parentId == null) return [...nodes, newNode];
  return nodes.map((n) => {
    if (n.id === parentId) return { ...n, children: [...n.children, newNode] };
    return { ...n, children: treeInsert(n.children, parentId, newNode) };
  });
}

function treeRemove(nodes, id) {
  return nodes.filter((n) => n.id !== id).map((n) => ({ ...n, children: treeRemove(n.children, id) }));
}

function treeRename(nodes, id, name) {
  return nodes.map((n) => (n.id === id ? { ...n, name } : { ...n, children: treeRename(n.children, id, name) }));
}

function treeExtract(nodes, id) {
  let extracted = null;
  const filtered = [];
  for (const n of nodes) {
    if (n.id === id) {
      extracted = n;
      continue;
    }
    const [childList, childExtracted] = treeExtract(n.children, id);
    if (childExtracted) extracted = childExtracted;
    filtered.push({ ...n, children: childList });
  }
  return [filtered, extracted];
}

function treeFind(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = treeFind(n.children, id);
    if (found) return found;
  }
  return null;
}

// finds the first Model that contains a Humanoid — i.e. a usable rig — anywhere in a tree
function findRigNode(nodes) {
  for (const n of nodes) {
    if (n.type === "model" && n.children.some((c) => c.type === "humanoid")) return n;
    const found = findRigNode(n.children);
    if (found) return found;
  }
  return null;
}

function treeMergeProps(nodes, id, partial) {
  return nodes.map((n) => (n.id === id ? { ...n, props: { ...n.props, ...partial } } : { ...n, children: treeMergeProps(n.children, id, partial) }));
}

function treeInsertAfter(nodes, afterId, newNode) {
  const idx = nodes.findIndex((n) => n.id === afterId);
  if (idx >= 0) {
    const arr = [...nodes];
    arr.splice(idx + 1, 0, newNode);
    return arr;
  }
  return nodes.map((n) => ({ ...n, children: treeInsertAfter(n.children, afterId, newNode) }));
}

function cloneNodeDeep(node) {
  return { ...node, id: nextId(), props: { ...node.props }, children: node.children.map(cloneNodeDeep) };
}

// walks an original node and its clone in lockstep, mapping every old id to its new id —
// used so parts attached to a model (which live outside the tree) can follow it when it's
// duplicated, cut, or copy-pasted.
function collectIdMapping(original, clone, map) {
  map.set(original.id, clone.id);
  for (let i = 0; i < original.children.length; i++) {
    collectIdMapping(original.children[i], clone.children[i], map);
  }
}

// gives a duplicate a numbered name based on the original: "Part" -> "Part1" -> "Part2"...
function nextCopyName(baseName, existingNames) {
  const m = /^(.*?)(\d+)?$/.exec(baseName || "Item");
  const root = m[1] || baseName || "Item";
  const nameSet = new Set(existingNames);
  let n = 1;
  let candidate = `${root}${n}`;
  while (nameSet.has(candidate)) {
    n++;
    candidate = `${root}${n}`;
  }
  return candidate;
}

function snapValue(v, step) {
  return step > 0 ? Math.round(v / step) * step : v;
}

function treeForEach(nodes, fn) {
  for (const n of nodes) {
    fn(n);
    treeForEach(n.children, fn);
  }
}

// which service's extra-tree currently "owns" a given node id (walks every service)
function findServiceOfExtraId(trees, id) {
  for (const service of Object.keys(trees)) {
    if (treeFind(trees[service], id)) return service;
  }
  return null;
}

function collectContainerOptions(trees) {
  const out = [];
  Object.keys(trees).forEach((service) => {
    out.push({ service, id: null, label: `${service} (root)` });
    const walk = (nodes, path) => {
      nodes.forEach((n) => {
        if (n.type === "folder" || n.type === "model") {
          out.push({ service, id: n.id, label: `${service} / ${path}${n.name}` });
        }
        walk(n.children, `${path}${n.name} / `);
      });
    };
    walk(trees[service], "");
  });
  return out;
}

// combines every Blur / Bloom / GrayScale instance under Lighting into one CSS filter for the viewport
function collectLightingEffects(trees) {
  let blur = 0;
  let bloom = 0;
  let gray = 0;
  treeForEach(trees.Lighting || [], (n) => {
    if (n.type === "blur" && n.props && n.props.enabled) blur += n.props.size || 0;
    if (n.type === "bloom" && n.props && n.props.enabled) bloom += n.props.intensity || 0;
    if (n.type === "grayscale" && n.props && n.props.enabled) gray += n.props.amount || 0;
  });
  blur = Math.min(24, blur);
  bloom = Math.min(3, bloom);
  gray = Math.min(100, gray);
  const parts = [];
  if (blur > 0) parts.push(`blur(${blur}px)`);
  if (bloom > 0) parts.push(`brightness(${(1 + bloom * 0.25).toFixed(2)}) saturate(${(1 + bloom * 0.15).toFixed(2)})`);
  if (gray > 0) parts.push(`grayscale(${gray}%)`);
  return parts.length ? parts.join(" ") : "none";
}

// ----------------------------- icons (tiny inline svg) -----------------------------

const Icon = ({ children }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const SelectIcon = () => <Icon><path d="M4 4l7 16 2-7 7-2z" /></Icon>;
const MoveIcon = () => <Icon><path d="M12 2v20M2 12h20M5 9l-3 3 3 3M19 9l3 3-3 3M9 5l3-3 3 3M9 19l3 3 3-3" /></Icon>;
const ScaleIcon = () => <Icon><path d="M4 20h6M4 20v-6M4 20L14 10M14 4h6v6" /></Icon>;
const RotateIcon = () => <Icon><path d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6" /></Icon>;
const PlayIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>;
const StopIcon = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>;
const TrashIcon = () => <Icon><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></Icon>;

// explorer service / folder icons, styled after the provided icon sheet
function FolderIcon({ badge, size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path
        d="M2.5 6.5c0-1.1.9-2 2-2h5.2l1.8 1.8h8c1.1 0 2 .9 2 2v8.2c0 1.1-.9 2-2 2h-15c-1.1 0-2-.9-2-2z"
        fill="#f6bb42"
        stroke="#c9932a"
        strokeWidth="0.6"
      />
      {badge === "square" && <rect x="14.3" y="12.6" width="6.2" height="6.2" rx="1" fill="#ffffff" stroke="#c9932a" strokeWidth="0.5" />}
      {badge === "person" && (
        <g transform="translate(13.6,11.8)">
          <circle cx="3.6" cy="2" r="1.7" fill="#ffffff" />
          <path d="M0.7 7.4c0-1.9 1.3-3.2 2.9-3.2s2.9 1.3 2.9 3.2z" fill="#ffffff" />
        </g>
      )}
      {badge === "circle" && (
        <g>
          <circle cx="17.4" cy="16.4" r="3.4" fill="#4a8fe0" stroke="#28518c" strokeWidth="0.5" />
          <path d="M14.5 16.4h5.8M17.4 13.5v5.8" stroke="#d4e8ff" strokeWidth="0.5" />
        </g>
      )}
    </svg>
  );
}

function SunIcon({ size = 15 }) {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      {rays.map((a) => {
        const rad = (a * Math.PI) / 180;
        return (
          <line
            key={a}
            x1={12 + 6 * Math.cos(rad)}
            y1={12 + 6 * Math.sin(rad)}
            x2={12 + 10.5 * Math.cos(rad)}
            y2={12 + 10.5 * Math.sin(rad)}
            stroke="#f6a623"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        );
      })}
      <circle cx="12" cy="12" r="5" fill="#f6a623" />
    </svg>
  );
}

function GlobeIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9.2" fill="#3f7fd1" stroke="#28518c" strokeWidth="0.7" />
      <ellipse cx="8.3" cy="8.8" rx="3" ry="2" fill="#5cb85c" />
      <ellipse cx="14.3" cy="14.2" rx="3.6" ry="2.4" fill="#5cb85c" />
      <circle cx="9.2" cy="16" r="1.5" fill="#5cb85c" />
    </svg>
  );
}

function GuiIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="16" rx="2.5" fill="#2fa8e6" stroke="#1670a8" strokeWidth="1.4" />
      <rect x="6" y="7" width="12" height="10" rx="1" fill="#bfe6fb" opacity="0.35" />
    </svg>
  );
}

function Chevron({ open }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 10,
        textAlign: "center",
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 100ms",
        color: COLORS.textMuted,
        flexShrink: 0,
      }}
    >
      ▸
    </span>
  );
}

function PlusIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function GuiPartIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect x="4" y="6" width="16" height="12" rx="1.5" fill="#7fd1e0" stroke="#2b8f9e" strokeWidth="1.2" />
      <rect x="4" y="6" width="16" height="3.5" rx="1.5" fill="#2b8f9e" opacity="0.7" />
    </svg>
  );
}

function ModelIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect x="3" y="3" width="8" height="8" rx="1" fill="#f2c30d" />
      <rect x="13" y="3" width="8" height="8" rx="1" fill="#e0524a" />
      <rect x="3" y="13" width="8" height="8" rx="1" fill="#4a90d9" />
      <rect x="13" y="13" width="8" height="8" rx="1" fill="#c9c9c9" />
    </svg>
  );
}

function BlurIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="10" r="6.5" fill="#ffffff" opacity="0.25" />
      <circle cx="12" cy="10" r="4.5" fill="#ffffff" opacity="0.45" />
      <path d="M12 4c3 3 4.5 6 3 10-1 2.6-4 2.6-5 0-1-2.4 0-6.5 2-10z" fill="#ffffff" opacity="0.8" />
    </svg>
  );
}

function FrameIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect x="4" y="4" width="16" height="16" fill="none" stroke="#e07b28" strokeWidth="1.6" />
      {[[4, 4], [20, 4], [4, 20], [20, 20]].map(([x, y]) => (
        <rect key={x + "-" + y} x={x - 1.6} y={y - 1.6} width="3.2" height="3.2" fill="#e07b28" />
      ))}
    </svg>
  );
}

function TextIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="3" fill="#3ea6e0" />
      <rect x="10.5" y="4" width="3" height="16" fill="#3ea6e0" />
    </svg>
  );
}

function ButtonIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect x="3" y="6" width="18" height="12" rx="2" fill="#3fa84a" stroke="#297032" strokeWidth="1" />
      <rect x="6" y="9" width="6" height="4" rx="0.5" fill="#e8f5e9" opacity="0.8" />
    </svg>
  );
}

function RemoteEventIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path d="M14 2 5 14h6l-1 8 9-13h-6z" fill="#e07b28" stroke="#a85c1c" strokeWidth="0.6" />
    </svg>
  );
}

function ValueIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke="#e6e6e6" strokeWidth="1.8" strokeLinecap="round">
      <path d="M9 3 7 21M17 3l-2 18M4 9h16M3.5 15h16" />
    </svg>
  );
}

function BoolIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect x="4" y="4" width="16" height="16" rx="1.5" fill="none" stroke="#e6e6e6" strokeWidth="1.6" />
      <path d="M7 13l3.2 3.2L17 9" fill="none" stroke="#4caf50" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ConfigurationIcon({ size = 15 }) {
  const petals = [0, 60, 120, 180, 240, 300];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      {petals.map((a) => (
        <ellipse
          key={a}
          cx={12 + 6.5 * Math.cos((a * Math.PI) / 180)}
          cy={12 + 6.5 * Math.sin((a * Math.PI) / 180)}
          rx="3.4"
          ry="2.2"
          fill="#bdbdbd"
          transform={`rotate(${a} ${12 + 6.5 * Math.cos((a * Math.PI) / 180)} ${12 + 6.5 * Math.sin((a * Math.PI) / 180)})`}
        />
      ))}
      <circle cx="12" cy="12" r="4" fill="#8a8a8a" />
    </svg>
  );
}

function BoneIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect x="9" y="4" width="6" height="16" fill="#4a90d9" />
      <circle cx="9" cy="5.5" r="3" fill="#4a90d9" />
      <circle cx="15" cy="5.5" r="3" fill="#4a90d9" />
      <circle cx="9" cy="18.5" r="3" fill="#4a90d9" />
      <circle cx="15" cy="18.5" r="3" fill="#4a90d9" />
    </svg>
  );
}

function WeldIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke="#dcdcdc" strokeWidth="1.6" strokeLinecap="round">
      <path d="M6 18 17 5" fill="none" />
      <path d="M15 3l3 3-2 2-3-3z" fill="#dcdcdc" stroke="none" />
      <circle cx="6.5" cy="17.3" r="1.4" fill="#dcdcdc" stroke="none" />
    </svg>
  );
}

function HumanoidIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="6" r="3.4" fill="#5fa8f5" />
      <path d="M5.5 21c0-4.4 2.9-7.2 6.5-7.2s6.5 2.8 6.5 7.2z" fill="#5fa8f5" />
    </svg>
  );
}

function RootPartIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect x="4" y="4" width="16" height="16" rx="2" fill="rgba(163,162,165,0.3)" stroke="#a3a2a5" strokeWidth="1.4" strokeDasharray="3 2" />
      <circle cx="12" cy="12" r="2.2" fill="#a3a2a5" />
    </svg>
  );
}

function UICornerIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path d="M4 12V9a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v6a5 5 0 0 1-5 5H9" fill="none" stroke="#7fd1e0" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="9" cy="9" r="1.6" fill="#7fd1e0" />
    </svg>
  );
}

function UIStrokeIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="#e07b28" strokeWidth="3" />
    </svg>
  );
}

function BloomIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3" fill="#fff6c9" />
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="#f6e27a" strokeWidth="1.4" opacity="0.8" />
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="#f6e27a" strokeWidth="1" opacity="0.4" />
    </svg>
  );
}

function GrayscaleIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" fill="#bdbdbd" stroke="#8a8a8a" strokeWidth="0.8" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="#2b2b2b" />
    </svg>
  );
}

function ScriptIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path d="M6 2h9l4 4v16H6z" fill="#4a90d9" stroke="#2c5f8a" strokeWidth="0.8" />
      <path d="M15 2v4h4" fill="none" stroke="#2c5f8a" strokeWidth="0.8" />
      <path d="M8.5 11h7M8.5 14h7M8.5 17h4" stroke="#dbe9f7" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

const TYPE_META = {
  folder: { label: "Folder", Icon: FolderIcon },
  model: { label: "Model", Icon: ModelIcon },
  frame: { label: "Frame", Icon: FrameIcon },
  text: { label: "Text", Icon: TextIcon },
  button: { label: "Button", Icon: ButtonIcon },
  remoteevent: { label: "RemoteEvent", Icon: RemoteEventIcon },
  value: { label: "Value", Icon: ValueIcon },
  bool: { label: "Bool", Icon: BoolIcon },
  configuration: { label: "Configuration", Icon: ConfigurationIcon },
  bone: { label: "Bone", Icon: BoneIcon },
  weld: { label: "Weld", Icon: WeldIcon },
  blur: { label: "Blur", Icon: BlurIcon },
  humanoid: { label: "Humanoid", Icon: HumanoidIcon },
  gui: { label: "Gui", Icon: GuiIcon },
  script: { label: "Script", Icon: ScriptIcon },
  humanoidrootpart: { label: "HumanoidRootPart", Icon: RootPartIcon },
  uicorner: { label: "UICorner", Icon: UICornerIcon },
  uistroke: { label: "UIStroke", Icon: UIStrokeIcon },
  bloom: { label: "Bloom", Icon: BloomIcon },
  grayscale: { label: "GrayScale", Icon: GrayscaleIcon },
  guipart: { label: "GuiPart", Icon: GuiPartIcon },
};

// default properties for newly-created explorer instances. Only genuinely
// visual/GUI things carry a Color — logic instances (events, values, rig
// joints, effects) don't need one.
const DEFAULT_PROPS = {
  folder: {},
  model: {},
  frame: { color: "#e07b28", width: 220, height: 160, x: 0, y: 0, rotation: 0 },
  text: { color: "#ffffff", text: "Hello!", width: 220, height: 40, x: 0, y: 0, rotation: 0 },
  button: { color: "#3fa84a", text: "Button", width: 160, height: 44, x: 0, y: 0, rotation: 0 },
  remoteevent: {},
  value: { color: "#cfcfcf", value: "0" },
  bool: { value: false },
  configuration: {},
  bone: { part0: null, part1: null, offset: null },
  weld: { part0: null, part1: null, offset: null },
  blur: { enabled: true, size: 10 },
  bloom: { enabled: true, intensity: 1 },
  grayscale: { enabled: true, amount: 0 },
  humanoid: { health: 100, maxHealth: 100, walkSpeed: 16 },
  gui: {},
  script: { code: "-- write your code here\n", language: "luau" },
  uicorner: { radius: 8 },
  uistroke: { color: "#000000", thickness: 2 },
  guipart: { color: "#7fd1e0" },
};

// which instance types are offered by the "+" menu, depending on where you're adding
const GENERAL_TYPES = ["folder", "model", "remoteevent", "value", "bool", "configuration", "bone", "weld", "humanoid", "script", "gui", "humanoidrootpart"];
const GUI_CONTEXT_TYPES = ["folder", "frame", "text", "button"];
const GUI_ELEMENT_MODIFIERS = ["uicorner", "uistroke"];
const LIGHTING_ROOT_TYPES = ["blur", "bloom", "grayscale", "folder"];
const STARTERGUI_ROOT_TYPES = ["gui"];

function getAllowedTypes(service, parentNode) {
  if (parentNode && parentNode.type === "gui") return GUI_CONTEXT_TYPES;
  if (parentNode && parentNode.type === "frame") return [...GUI_CONTEXT_TYPES, ...GUI_ELEMENT_MODIFIERS];
  if (parentNode && (parentNode.type === "button" || parentNode.type === "text")) return GUI_ELEMENT_MODIFIERS;
  if (parentNode == null && service === "StarterGui") return STARTERGUI_ROOT_TYPES;
  if (parentNode == null && service === "Lighting") return LIGHTING_ROOT_TYPES;
  return GENERAL_TYPES;
}

const ICON_SLOT_STYLE = { width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 12, lineHeight: 1 };


// ----------------------------- toolbar button -----------------------------

function ToolButton({ active, onClick, title, children, disabled }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 9px",
        background: active ? COLORS.btnActive : hover ? COLORS.btnHover : "transparent",
        border: "1px solid " + (active ? COLORS.btnActive : "transparent"),
        borderRadius: 3,
        color: disabled ? "#666" : COLORS.text,
        fontSize: 12,
        cursor: disabled ? "default" : "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div style={{ width: 1, alignSelf: "stretch", background: COLORS.border, margin: "2px 6px" }} />;
}

function TabButton({ active, onClick, children }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "6px 14px",
        fontSize: 12,
        cursor: "pointer",
        background: active ? COLORS.bg : "transparent",
        borderRight: "1px solid " + COLORS.border,
        color: active ? COLORS.text : COLORS.textMuted,
      }}
    >
      {children}
    </div>
  );
}

function SnapButton({ label, unit, options, value, onChange }) {
  const isOn = value !== 0;
  const cycle = () => {
    const idx = options.indexOf(value);
    const next = options[(idx + 1) % options.length];
    onChange(next);
  };
  return (
    <ToolButton title={`Cycle ${label} snap (click to change increment)`} active={isOn} onClick={cycle}>
      {label}: {isOn ? `${value}${unit}` : "Off"}
    </ToolButton>
  );
}

// ----------------------------- main component -----------------------------

export default function StudioEditor() {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const meshMapRef = useRef(new Map()); // id -> mesh
  const boxHelperRef = useRef(null);
  const gizmoGroupsRef = useRef({});
  const dragRef = useRef({ type: null });
  const camStateRef = useRef({ target: new THREE.Vector3(0, 1, 0), radius: 28, theta: Math.PI / 4, phi: 1.0 });
  const rafRef = useRef(null);
  const selectedIdRef = useRef(null);
  const toolRef = useRef("select");
  const playModeRef = useRef(false);
  const sunRef = useRef(null);
  const hemiRef = useRef(null);
  const keysRef = useRef({});
  const lastTimeRef = useRef(0);
  const extraTreesRef = useRef({});
  const objectsRef = useRef([]);
  const snapRef = useRef({ move: 0, rotate: 0, scale: 0 });

  const [objects, setObjects] = useState([]); // {id,name,type,color,material,locked}
  const [selectedId, setSelectedId] = useState(null);
  const [selectedService, setSelectedService] = useState(null); // e.g. "Lighting", "Storage"...
  const [expanded, setExpanded] = useState({ workspace: true });
  const [tool, setTool] = useState("select");
  const [snap, setSnap] = useState({ move: 0, rotate: 0, scale: 0 }); // 0 = off, else the increment
  const [rigMenuOpen, setRigMenuOpen] = useState(false);
  const [centerTab, setCenterTab] = useState("viewport"); // "viewport" | "script"
  const [openScript, setOpenScript] = useState(null); // { service, id } of the script open in the code editor tab
  const [rigMenuPos, setRigMenuPos] = useState({ left: 0, top: 0 });
  const rigButtonRef = useRef(null);
  const [playMode, setPlayMode] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [transform, setTransform] = useState(null); // {position,size,rotationDeg}
  const [lighting, setLighting] = useState({ brightness: 1.1, ambient: 0.9, color: "#fff3d6" });
  const [cameraFov, setCameraFov] = useState(55);
  const [extraTrees, setExtraTrees] = useState(() => ({
    Workspace: [],
    Lighting: [],
    StarterGui: [{ id: nextId(), type: "gui", name: "Gui", children: [], props: {} }],
    StarterPlayer: [],
    Storage: [],
  }));
  const [expandedExtra, setExpandedExtra] = useState({});
  const [addMenuTarget, setAddMenuTarget] = useState(null); // { service, parentId } parentId null = root
  const [renamingExtraId, setRenamingExtraId] = useState(null);
  const [selectedExtra, setSelectedExtra] = useState(null); // { service, id }
  const [dragOverKey, setDragOverKey] = useState(null); // id/key of the row currently being dragged over
  const [fireToast, setFireToast] = useState(null);
  const fireToastTimeoutRef = useRef(null);
  const testRigRef = useRef(null); // spawned play-test rig, so Stop can clean it up
  const dragPartIdRef = useRef(null);
  const dragExtraRef = useRef(null); // { service, id }

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { playModeRef.current = playMode; }, [playMode]);
  useEffect(() => { extraTreesRef.current = extraTrees; }, [extraTrees]);
  useEffect(() => { objectsRef.current = objects; }, [objects]);
  useEffect(() => { snapRef.current = snap; }, [snap]);

  // only things that live in Workspace are actually part of the 3D world — anything
  // organized under StarterPlayer or Storage is just kept around (not spawned in).
  useEffect(() => {
    objects.forEach((o) => {
      const mesh = meshMapRef.current.get(o.id);
      if (!mesh) return;
      const owningService = o.parentExtraId == null ? "Workspace" : findServiceOfExtraId(extraTrees, o.parentExtraId) || "Workspace";
      mesh.visible = owningService === "Workspace";
    });
  }, [objects, extraTrees]);

  // ---------------- transform readback ----------------
  const readTransform = useCallback((mesh) => {
    return {
      position: { x: round2(mesh.position.x), y: round2(mesh.position.y), z: round2(mesh.position.z) },
      size: { x: round2(mesh.scale.x), y: round2(mesh.scale.y), z: round2(mesh.scale.z) },
      rotationDeg: {
        x: round2(radToDeg(mesh.rotation.x)),
        y: round2(radToDeg(mesh.rotation.y)),
        z: round2(radToDeg(mesh.rotation.z)),
      },
    };
  }, []);

  const updateCameraPosition = useCallback(() => {
    const cs = camStateRef.current;
    const camera = cameraRef.current;
    if (!camera) return;
    const sinPhi = Math.sin(cs.phi);
    const x = cs.target.x + cs.radius * sinPhi * Math.sin(cs.theta);
    const y = cs.target.y + cs.radius * Math.cos(cs.phi);
    const z = cs.target.z + cs.radius * sinPhi * Math.cos(cs.theta);
    camera.position.set(x, y, z);
    camera.lookAt(cs.target);
  }, []);

  // ---------------- selection ----------------
  const selectObject = useCallback((id) => {
    const scene = sceneRef.current;
    setSelectedService(null);
    setSelectedExtra(null);
    if (boxHelperRef.current) {
      scene.remove(boxHelperRef.current);
      boxHelperRef.current.dispose && boxHelperRef.current.dispose();
      boxHelperRef.current = null;
    }
    setSelectedId(id);
    if (id == null) {
      setTransform(null);
      Object.values(gizmoGroupsRef.current).forEach((g) => (g.visible = false));
      return;
    }
    const mesh = meshMapRef.current.get(id);
    if (!mesh) return;
    const helper = new THREE.BoxHelper(mesh, 0xffe600);
    scene.add(helper);
    boxHelperRef.current = helper;
    setTransform(readTransform(mesh));
    Object.entries(gizmoGroupsRef.current).forEach(([name, g]) => {
      g.visible = !playModeRef.current && name === toolRef.current;
    });
  }, [readTransform]);

  const selectService = useCallback((name) => {
    const scene = sceneRef.current;
    if (boxHelperRef.current) {
      scene.remove(boxHelperRef.current);
      boxHelperRef.current.dispose && boxHelperRef.current.dispose();
      boxHelperRef.current = null;
    }
    setSelectedId(null);
    setSelectedExtra(null);
    setTransform(null);
    Object.values(gizmoGroupsRef.current).forEach((g) => (g.visible = false));
    if (name === "Lighting" && sunRef.current && hemiRef.current) {
      setLighting({
        brightness: round2(sunRef.current.intensity),
        ambient: round2(hemiRef.current.intensity),
        color: "#" + sunRef.current.color.getHexString(),
      });
    }
    if (name === "Camera" && cameraRef.current) {
      setCameraFov(round2(cameraRef.current.fov));
    }
    setSelectedService(name);
  }, []);

  const selectExtra = useCallback((service, id) => {
    const scene = sceneRef.current;
    if (boxHelperRef.current) {
      scene.remove(boxHelperRef.current);
      boxHelperRef.current.dispose && boxHelperRef.current.dispose();
      boxHelperRef.current = null;
    }
    setSelectedId(null);
    setSelectedService(null);
    setTransform(null);
    Object.values(gizmoGroupsRef.current).forEach((g) => (g.visible = false));
    setSelectedExtra({ service, id });
  }, []);

  const setLightingField = useCallback((field, value) => {
    if (field === "color") {
      if (sunRef.current) sunRef.current.color.set(value);
      setLighting((prev) => ({ ...prev, color: value }));
      return;
    }
    const v = parseFloat(value);
    if (Number.isNaN(v)) return;
    if (field === "brightness" && sunRef.current) sunRef.current.intensity = v;
    if (field === "ambient" && hemiRef.current) hemiRef.current.intensity = v;
    setLighting((prev) => ({ ...prev, [field]: v }));
  }, []);

  const setCameraField = useCallback((value) => {
    const v = parseFloat(value);
    if (Number.isNaN(v) || !cameraRef.current) return;
    const clamped = Math.min(120, Math.max(10, v));
    cameraRef.current.fov = clamped;
    cameraRef.current.updateProjectionMatrix();
    setCameraFov(v);
  }, []);

  const toggleExpanded = useCallback((key) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleExpandedExtra = useCallback((id) => {
    setExpandedExtra((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // ---------------- explorer tree: folders / gui parts ----------------
  const addExtraNode = useCallback((service, parentId, type) => {
    const id = nextId();
    const node = {
      id,
      type,
      name: (TYPE_META[type] && TYPE_META[type].label) || "Item",
      children: [],
      props: { ...(DEFAULT_PROPS[type] || {}) },
    };
    setExtraTrees((prev) => ({ ...prev, [service]: treeInsert(prev[service], parentId, node) }));
    if (parentId != null) setExpandedExtra((prev) => ({ ...prev, [parentId]: true }));
    else setExpanded((prev) => ({ ...prev, [service.toLowerCase()]: true }));
    setAddMenuTarget(null);
  }, []);

  const renameExtraNode = useCallback((service, id, name) => {
    setExtraTrees((prev) => ({ ...prev, [service]: treeRename(prev[service], id, name) }));
  }, []);

  const setExtraProp = useCallback((service, id, key, value) => {
    setExtraTrees((prev) => ({ ...prev, [service]: treeMergeProps(prev[service], id, { [key]: value }) }));
  }, []);

  const showToast = useCallback((msg) => {
    setFireToast(msg);
    if (fireToastTimeoutRef.current) clearTimeout(fireToastTimeoutRef.current);
    fireToastTimeoutRef.current = setTimeout(() => setFireToast(null), 1800);
  }, []);

  const fireRemoteEvent = useCallback((name) => {
    showToast(`🔥 ${name} fired!`);
  }, [showToast]);

  const openScriptExternally = useCallback((target) => {
    const uri = target === "vscode" ? "vscode://file/untitled.lua" : "visualstudio://open/untitled.lua";
    try {
      window.open(uri, "_blank");
      showToast(target === "vscode" ? "📝 Asking VS Code to open…" : "📝 Asking Visual Studio to open…");
    } catch (e) {
      showToast("Couldn't launch — is it installed?");
    }
  }, [showToast]);

  const copyScriptCode = useCallback((code) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code || "").then(
        () => showToast("📋 Copied to clipboard"),
        () => showToast("Copy failed")
      );
    } else {
      showToast("Copy not supported here");
    }
  }, [showToast]);

  const setWeldPart = useCallback((service, id, which, rawPartId) => {
    const partId = rawPartId === "" ? null : Number(rawPartId);
    setExtraTrees((prev) => {
      const node = treeFind(prev[service], id);
      if (!node) return prev;
      const newProps = { ...node.props, [which]: partId };
      if (newProps.part0 != null && newProps.part1 != null) {
        const m0 = meshMapRef.current.get(newProps.part0);
        const m1 = meshMapRef.current.get(newProps.part1);
        newProps.offset = m0 && m1 ? { x: m1.position.x - m0.position.x, y: m1.position.y - m0.position.y, z: m1.position.z - m0.position.z } : null;
      } else {
        newProps.offset = null;
      }
      return { ...prev, [service]: treeMergeProps(prev[service], id, newProps) };
    });
  }, []);

  const reorderParts = useCallback((draggedId, targetId) => {
    if (draggedId === targetId) return;
    setObjects((prev) => {
      const arr = [...prev];
      const from = arr.findIndex((o) => o.id === draggedId);
      const to = arr.findIndex((o) => o.id === targetId);
      if (from < 0 || to < 0) return prev;
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
  }, []);

  const movePartToContainer = useCallback((partId, containerId, service) => {
    setObjects((prev) =>
      prev.map((o) => (o.id === partId ? { ...o, parentExtraId: containerId, homeService: service || o.homeService || "Workspace" } : o))
    );
  }, []);

  const duplicatePart = useCallback((id, overrideParentExtraId, keepName, overrideService, offsetOverride) => {
    const meta = objectsRef.current.find((o) => o.id === id);
    const original = meshMapRef.current.get(id);
    if (!meta || !original) return null;
    const newId = nextId();
    const geometry = createGeometry(meta.type);
    const material = Array.isArray(original.material) ? original.material.map((m) => m.clone()) : original.material.clone();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.scale.copy(original.scale);
    mesh.rotation.copy(original.rotation);
    const offset = offsetOverride !== undefined ? offsetOverride : keepName ? 0 : 2;
    mesh.position.set(original.position.x + offset, original.position.y, original.position.z + offset);
    sceneRef.current.add(mesh);
    meshMapRef.current.set(newId, mesh);
    setObjects((prev) => {
      const idx = prev.findIndex((o) => o.id === id);
      const clone = {
        ...meta,
        id: newId,
        name: keepName ? meta.name : nextCopyName(meta.name, prev.map((o) => o.name)),
        parentExtraId: overrideParentExtraId !== undefined ? overrideParentExtraId : meta.parentExtraId,
        homeService: overrideService || meta.homeService || "Workspace",
      };
      const arr = [...prev];
      arr.splice(idx + 1, 0, clone);
      return arr;
    });
    return newId;
  }, []);

  const deleteObject = useCallback((id) => {
    const mesh = meshMapRef.current.get(id);
    if (!mesh) return;
    sceneRef.current.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    meshMapRef.current.delete(id);
    setObjects((prev) => prev.filter((o) => o.id !== id));
    if (selectedIdRef.current === id) selectObject(null);
  }, [selectObject]);

  // deleting a Folder/Model also has to remove any parts that were organized inside it —
  // otherwise the parts are left with a parentExtraId pointing at nothing, and their mesh
  // stays in the 3D scene even though the Explorer no longer shows a home for them.
  const deleteExtraNode = useCallback((service, id) => {
    const node = treeFind(extraTreesRef.current[service] || [], id);
    if (node) {
      const idsToRemove = new Set();
      treeForEach([node], (n) => idsToRemove.add(n.id));
      objectsRef.current
        .filter((o) => o.parentExtraId != null && idsToRemove.has(o.parentExtraId))
        .forEach((o) => deleteObject(o.id));
    }
    setExtraTrees((prev) => ({ ...prev, [service]: treeRemove(prev[service], id) }));
    setSelectedExtra((prev) => (prev && prev.id === id ? null : prev));
  }, [deleteObject]);

  const moveExtraNode = useCallback((fromService, draggedId, toService, targetId) => {
    if (draggedId === targetId) return;
    setExtraTrees((prev) => {
      const [withoutDragged, draggedNode] = treeExtract(prev[fromService], draggedId);
      if (!draggedNode) return prev;
      const afterRemoval = { ...prev, [fromService]: withoutDragged };
      const inserted = treeInsert(afterRemoval[toService], targetId, draggedNode);
      return { ...afterRemoval, [toService]: inserted };
    });
  }, []);

  const duplicateExtraNode = useCallback((service, id) => {
    const node = treeFind(extraTreesRef.current[service] || [], id);
    if (!node) return;
    const clone = cloneNodeDeep(node);
    const existingNames = [];
    Object.values(extraTreesRef.current).forEach((list) => treeForEach(list, (n) => existingNames.push(n.name)));
    clone.name = nextCopyName(node.name, existingNames);

    // carry along any parts that were organized inside the duplicated node (e.g. a rig's body parts)
    const idMap = new Map();
    collectIdMapping(node, clone, idMap);
    objectsRef.current
      .filter((o) => o.parentExtraId != null && idMap.has(o.parentExtraId))
      .forEach((meta) => duplicatePart(meta.id, idMap.get(meta.parentExtraId), true, undefined, 2));

    setExtraTrees((prev) => ({ ...prev, [service]: treeInsertAfter(prev[service], id, clone) }));
  }, [duplicatePart]);

  // ---------------- right-click context menu: clipboard + grouping ----------------
  const [contextMenu, setContextMenu] = useState(null); // { x, y, target: {kind:'part',id} | {kind:'extra',service,id} | {kind:'service',service} }
  const [clipboard, setClipboard] = useState(null); // { kind, service?, id?, mode:'copy'|'cut', snapshot? }
  const [moveToTarget, setMoveToTarget] = useState(null); // same shape as a context-menu target

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const copyTarget = useCallback((target) => {
    setClipboard({ ...target, mode: "copy" });
    setContextMenu(null);
  }, []);

  const cutTarget = useCallback((target) => {
    setClipboard({ ...target, mode: "cut" });
    setContextMenu(null);
  }, []);

  const pasteInto = useCallback((destTarget) => {
    setContextMenu(null);
    if (!clipboard) return;
    const destContainerId = destTarget.kind === "extra" ? destTarget.id : null;
    const destService = destTarget.kind === "service" ? destTarget.service : destTarget.kind === "extra" ? destTarget.service : "Workspace";

    if (clipboard.kind === "part") {
      if (clipboard.mode === "copy") {
        duplicatePart(clipboard.id, destContainerId, false);
      } else {
        const wasSelected = selectedIdRef.current === clipboard.id;
        const newId = duplicatePart(clipboard.id, destContainerId, true);
        deleteObject(clipboard.id);
        if (wasSelected && newId != null) selectObject(newId);
      }
    } else if (clipboard.kind === "extra") {
      const node = treeFind(extraTreesRef.current[clipboard.service] || [], clipboard.id);
      if (node) {
        const clone = cloneNodeDeep(node);
        const idMap = new Map();
        collectIdMapping(node, clone, idMap);
        const attachedParts = objectsRef.current.filter((o) => o.parentExtraId != null && idMap.has(o.parentExtraId));

        if (clipboard.mode === "copy") {
          const existingNames = [];
          Object.values(extraTreesRef.current).forEach((list) => treeForEach(list, (n) => existingNames.push(n.name)));
          clone.name = nextCopyName(node.name, existingNames);
          attachedParts.forEach((meta) => duplicatePart(meta.id, idMap.get(meta.parentExtraId), true, destService, 0));
          setExtraTrees((prev) => ({ ...prev, [destService]: treeInsert(prev[destService], destContainerId, clone) }));
        } else {
          // cut: recreate the parts (and the node) at the destination, then remove the originals
          attachedParts.forEach((meta) => {
            duplicatePart(meta.id, idMap.get(meta.parentExtraId), true, destService, 0);
            deleteObject(meta.id);
          });
          setExtraTrees((prev) => {
            const withDest = { ...prev, [destService]: treeInsert(prev[destService], destContainerId, clone) };
            return { ...withDest, [clipboard.service]: treeRemove(withDest[clipboard.service], clipboard.id) };
          });
          if (selectedExtra && selectedExtra.id === clipboard.id) setSelectedExtra(null);
        }
      }
    }
    setClipboard(null);
  }, [clipboard, duplicatePart, deleteObject, selectObject, selectedExtra]);

  const groupTarget = useCallback((target, groupType) => {
    setContextMenu(null);
    if (target.kind === "part") {
      const meta = objects.find((o) => o.id === target.id);
      const currentParent = meta ? meta.parentExtraId : null;
      const service = "Workspace";
      const groupId = nextId();
      const group = { id: groupId, type: groupType, name: TYPE_META[groupType].label, children: [], props: { ...(DEFAULT_PROPS[groupType] || {}) } };
      setExtraTrees((prev) => ({ ...prev, [service]: treeInsert(prev[service], currentParent, group) }));
      movePartToContainer(target.id, groupId);
    } else if (target.kind === "extra") {
      const groupId = nextId();
      const group = { id: groupId, type: groupType, name: TYPE_META[groupType].label, children: [], props: { ...(DEFAULT_PROPS[groupType] || {}) } };
      setExtraTrees((prev) => {
        const withGroup = { ...prev, [target.service]: treeInsertAfter(prev[target.service], target.id, group) };
        const [withoutDragged, draggedNode] = treeExtract(withGroup[target.service], target.id);
        if (!draggedNode) return withGroup;
        const inserted = treeInsert(withoutDragged, groupId, draggedNode);
        return { ...withGroup, [target.service]: inserted };
      });
    }
  }, [objects, movePartToContainer]);

  const performMoveTo = useCallback((dest) => {
    setMoveToTarget((current) => {
      if (current) {
        if (current.kind === "part") movePartToContainer(current.id, dest.id);
        else if (current.kind === "extra") moveExtraNode(current.service, current.id, dest.service, dest.id);
      }
      return null;
    });
  }, [movePartToContainer, moveExtraNode]);

  const handleContextAction = useCallback((action) => {
    setContextMenu((menu) => {
      if (!menu) return null;
      const target = menu.target;
      switch (action) {
        case "copy": copyTarget(target); break;
        case "cut": cutTarget(target); break;
        case "paste": pasteInto(target); break;
        case "duplicate":
          if (target.kind === "part") duplicatePart(target.id);
          else if (target.kind === "extra") duplicateExtraNode(target.service, target.id);
          break;
        case "rename":
          if (target.kind === "part") setRenamingId(target.id);
          else if (target.kind === "extra") setRenamingExtraId(target.id);
          break;
        case "groupFolder": groupTarget(target, "folder"); break;
        case "groupModel": groupTarget(target, "model"); break;
        case "moveTo": setMoveToTarget(target); break;
        case "delete":
          if (target.kind === "part") deleteObject(target.id);
          else if (target.kind === "extra") deleteExtraNode(target.service, target.id);
          break;
        default:
          break;
      }
      return null;
    });
  }, [copyTarget, cutTarget, pasteInto, duplicatePart, duplicateExtraNode, groupTarget, deleteObject, deleteExtraNode]);

  const showGizmoForTool = useCallback((toolName) => {
    Object.entries(gizmoGroupsRef.current).forEach(([name, g]) => {
      g.visible = !playModeRef.current && selectedIdRef.current != null && name === toolName;
    });
  }, []);

  // ---------------- insert / delete ----------------
  const insertPart = useCallback((type) => {
    const id = nextId();
    const geometry = createGeometry(type);
    const material = new THREE.MeshStandardMaterial({ color: COLORS.defaultPartColor });
    applyMaterialPreset(material, "Plastic", COLORS.defaultPartColor);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const size = type === "sphere" || type === "cylinder" ? { x: 4, y: 4, z: 4 } : { x: 4, y: 1, z: 2 };
    mesh.scale.set(size.x, size.y, size.z);
    const px = round2((Math.random() - 0.5) * 12);
    const pz = round2((Math.random() - 0.5) * 12);
    mesh.position.set(px, size.y / 2, pz);

    sceneRef.current.add(mesh);
    meshMapRef.current.set(id, mesh);

    const label = type.charAt(0).toUpperCase() + type.slice(1);
    setObjects((prev) => [...prev, { id, name: label, type, color: COLORS.defaultPartColor, material: "Plastic", parentExtraId: null, homeService: "Workspace", surfaceTexture: "default" }]);
    selectObject(id);
  }, [selectObject]);

  // HumanoidRootPart — the invisible-ish anchor part every rig needs, sized like Roblox's default (2x2x1)
  const insertHumanoidRootPart = useCallback((parentExtraId, service) => {
    const id = nextId();
    const geometry = createGeometry("block");
    const color = "#a3a2a5";
    const material = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.35 });
    applyMaterialPreset(material, "Plastic", color);
    material.transparent = true;
    material.opacity = 0.35;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.scale.set(2, 2, 1);
    const px = round2((Math.random() - 0.5) * 12);
    const pz = round2((Math.random() - 0.5) * 12);
    mesh.position.set(px, 1, pz);
    sceneRef.current.add(mesh);
    meshMapRef.current.set(id, mesh);
    const parentId = parentExtraId == null ? null : parentExtraId;
    setObjects((prev) => [...prev, { id, name: "HumanoidRootPart", type: "block", color, material: "Plastic", parentExtraId: parentId, homeService: service || "Workspace", surfaceTexture: "default" }]);
    if (parentId != null) setExpandedExtra((prev) => ({ ...prev, [parentId]: true }));
    selectObject(id);
  }, [selectObject]);

  // builds a full, ready-to-animate humanoid rig: a Model containing a Humanoid,
  // a HumanoidRootPart, and the standard set of body parts — either the 15-part
  // R15 rig or the classic 6-part R6 rig.
  const createRig = useCallback((rigType) => {
    const modelId = nextId();
    const humanoid = { id: nextId(), type: "humanoid", name: "Humanoid", children: [], props: { ...(DEFAULT_PROPS.humanoid || {}) } };
    const model = { id: modelId, type: "model", name: rigType === "r6" ? "R6 Rig" : "R15 Rig", children: [humanoid], props: {} };
    setExtraTrees((prev) => ({ ...prev, Workspace: [...prev.Workspace, model] }));
    setExpanded((prev) => ({ ...prev, workspace: true }));
    setExpandedExtra((prev) => ({ ...prev, [modelId]: true }));

    const ox = round2((Math.random() - 0.5) * 14);
    const oz = round2((Math.random() - 0.5) * 14);
    const gray = "#a3a2a5";

    const specs =
      rigType === "r6"
        ? [
            { name: "Head", size: [2, 1, 1], pos: [0, 4.5, 0] },
            { name: "Torso", size: [2, 2, 1], pos: [0, 3, 0] },
            { name: "HumanoidRootPart", size: [2, 2, 1], pos: [0, 3, 0], transparent: true },
            { name: "LeftArm", size: [1, 2, 1], pos: [-1.5, 3.5, 0] },
            { name: "RightArm", size: [1, 2, 1], pos: [1.5, 3.5, 0] },
            { name: "LeftLeg", size: [1, 2, 1], pos: [-0.5, 1, 0] },
            { name: "RightLeg", size: [1, 2, 1], pos: [0.5, 1, 0] },
          ]
        : [
            { name: "Head", size: [1, 1, 1], pos: [0, 5.2, 0] },
            { name: "UpperTorso", size: [2, 1.1, 1], pos: [0, 4.15, 0] },
            { name: "LowerTorso", size: [2, 0.4, 1], pos: [0, 3.4, 0] },
            { name: "HumanoidRootPart", size: [2, 2, 1], pos: [0, 3.8, 0], transparent: true },
            { name: "LeftUpperArm", size: [0.8, 1.2, 0.8], pos: [-1.4, 3.55, 0] },
            { name: "RightUpperArm", size: [0.8, 1.2, 0.8], pos: [1.4, 3.55, 0] },
            { name: "LeftLowerArm", size: [0.8, 1.2, 0.8], pos: [-1.4, 2.35, 0] },
            { name: "RightLowerArm", size: [0.8, 1.2, 0.8], pos: [1.4, 2.35, 0] },
            { name: "LeftHand", size: [0.8, 0.4, 0.8], pos: [-1.4, 1.55, 0] },
            { name: "RightHand", size: [0.8, 0.4, 0.8], pos: [1.4, 1.55, 0] },
            { name: "LeftUpperLeg", size: [0.8, 1.4, 0.8], pos: [-0.6, 2.5, 0] },
            { name: "RightUpperLeg", size: [0.8, 1.4, 0.8], pos: [0.6, 2.5, 0] },
            { name: "LeftLowerLeg", size: [0.8, 1.4, 0.8], pos: [-0.6, 1.1, 0] },
            { name: "RightLowerLeg", size: [0.8, 1.4, 0.8], pos: [0.6, 1.1, 0] },
            { name: "LeftFoot", size: [0.8, 0.4, 0.8], pos: [-0.6, 0.2, 0] },
            { name: "RightFoot", size: [0.8, 0.4, 0.8], pos: [0.6, 0.2, 0] },
          ];

    const newParts = specs.map((spec) => {
      const id = nextId();
      const geometry = createGeometry("block");
      const material = new THREE.MeshStandardMaterial({ color: gray });
      applyMaterialPreset(material, "Plastic", gray);
      if (spec.transparent) {
        material.transparent = true;
        material.opacity = 0.35;
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = !spec.transparent;
      mesh.receiveShadow = !spec.transparent;
      mesh.scale.set(spec.size[0], spec.size[1], spec.size[2]);
      mesh.position.set(spec.pos[0] + ox, spec.pos[1], spec.pos[2] + oz);
      sceneRef.current.add(mesh);
      meshMapRef.current.set(id, mesh);
      return { id, name: spec.name, type: "block", color: gray, material: "Plastic", parentExtraId: modelId, homeService: "Workspace", surfaceTexture: "default" };
    });

    setObjects((prev) => [...prev, ...newParts]);
    selectExtra("Workspace", modelId);
  }, [selectExtra]);

  // ---------------- property field updates ----------------
  const setField = useCallback((category, axis, value) => {
    const id = selectedIdRef.current;
    if (id == null) return;
    const mesh = meshMapRef.current.get(id);
    if (!mesh) return;
    const v = parseFloat(value);
    if (Number.isNaN(v)) return;
    if (category === "position") mesh.position[axis] = v;
    else if (category === "size") {
      mesh.scale[axis] = Math.max(0.05, v);
      // keep tiled textures (Stud/Grid) scaled to the part's new size, so 1 tile ≈ 1 stud
      const singleMat = Array.isArray(mesh.material) ? null : mesh.material;
      if (singleMat && singleMat.map) {
        singleMat.map.repeat.set(Math.max(1, Math.round(mesh.scale.x)), Math.max(1, Math.round(mesh.scale.y)));
      }
    } else if (category === "rotationDeg") mesh.rotation[axis] = degToRad(v);
    setTransform(readTransform(mesh));
  }, [readTransform]);

  const setSurfaceTexture = useCallback((id, textureType) => {
    const mesh = meshMapRef.current.get(id);
    setObjects((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        if (mesh) applySurfaceTexture(mesh, textureType, o.color, o.material);
        return { ...o, surfaceTexture: textureType };
      })
    );
  }, []);

  const setName = useCallback((id, name) => {
    setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, name } : o)));
  }, []);

  const setColor = useCallback((id, hex) => {
    const mesh = meshMapRef.current.get(id);
    setObjects((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        if (mesh) applyMaterialPreset(mesh.material, o.material, hex);
        return { ...o, color: hex };
      })
    );
  }, []);

  const setMaterial = useCallback((id, materialName) => {
    const mesh = meshMapRef.current.get(id);
    setObjects((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        if (mesh) applyMaterialPreset(mesh.material, materialName, o.color);
        return { ...o, material: materialName };
      })
    );
  }, []);

  // ---------------- three.js setup (runs once) ----------------
  useEffect(() => {
    const mount = mountRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8fb8e8);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);

    // lights
    const hemi = new THREE.HemisphereLight(0xffffff, 0x546e63, 0.9);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff3d6, 1.1);
    sun.position.set(40, 60, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    scene.add(sun);
    sunRef.current = sun;
    hemiRef.current = hemi;

    // baseplate — a normal, editable part. Its stud grid is a real Surface Texture
    // (tiled per-stud via applySurfaceTexture) rather than a separate, non-deletable overlay.
    {
      const id = nextId();
      const geometry = createGeometry("block");
      const baseColor = "#787878"; // rgb(120,120,120)
      const material = new THREE.MeshStandardMaterial({ color: baseColor });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = true;
      mesh.scale.set(220, 4, 220);
      mesh.position.set(0, -2, 0);
      applySurfaceTexture(mesh, "grid", baseColor, "Plastic");
      scene.add(mesh);
      meshMapRef.current.set(id, mesh);
      setObjects((prev) => [...prev, { id, name: "Baseplate", type: "block", color: baseColor, material: "Plastic", parentExtraId: null, homeService: "Workspace", surfaceTexture: "grid" }]);
    }

    // initial sample part
    {
      const id = nextId();
      const geometry = createGeometry("block");
      const material = new THREE.MeshStandardMaterial({ color: COLORS.defaultPartColor });
      applyMaterialPreset(material, "Plastic", COLORS.defaultPartColor);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.scale.set(4, 1, 2);
      mesh.position.set(0, 0.5, 0);
      scene.add(mesh);
      meshMapRef.current.set(id, mesh);
      setObjects((prev) => [...prev, { id, name: "Part", type: "block", color: COLORS.defaultPartColor, material: "Plastic", parentExtraId: null, homeService: "Workspace", surfaceTexture: "default" }]);
    }

    // ---------------- gizmos ----------------
    const buildMoveGizmo = () => {
      const group = new THREE.Group();
      ["x", "y", "z"].forEach((axis) => {
        const mat = new THREE.MeshBasicMaterial({ color: AXIS_COLOR[axis], depthTest: false });
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.1, 10), mat);
        shaft.position.y = 0.85;
        const head = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.35, 12), mat);
        head.position.y = 1.55;
        const handle = new THREE.Group();
        handle.add(shaft, head);
        handle.userData = { axis, mode: "move" };
        shaft.userData = handle.userData;
        head.userData = handle.userData;
        handle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), AXIS_VEC[axis]);
        handle.renderOrder = 999;
        shaft.renderOrder = 999;
        head.renderOrder = 999;
        group.add(handle);
      });
      group.visible = false;
      return group;
    };

    const buildScaleGizmo = () => {
      const group = new THREE.Group();
      ["x", "y", "z"].forEach((axis) => {
        const mat = new THREE.MeshBasicMaterial({ color: AXIS_COLOR[axis], depthTest: false });
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 10), mat);
        shaft.position.y = 0.6;
        const cube = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), mat);
        cube.position.y = 1.15;
        const handle = new THREE.Group();
        handle.add(shaft, cube);
        handle.userData = { axis, mode: "scale" };
        shaft.userData = handle.userData;
        cube.userData = handle.userData;
        handle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), AXIS_VEC[axis]);
        handle.renderOrder = 999;
        shaft.renderOrder = 999;
        cube.renderOrder = 999;
        group.add(handle);
      });
      group.visible = false;
      return group;
    };

    const buildRotateGizmo = () => {
      const group = new THREE.Group();
      ["x", "y", "z"].forEach((axis) => {
        const mat = new THREE.MeshBasicMaterial({ color: AXIS_COLOR[axis], depthTest: false, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.03, 8, 48), mat);
        ring.userData = { axis, mode: "rotate" };
        ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), AXIS_VEC[axis]);
        ring.renderOrder = 999;
        group.add(ring);
      });
      group.visible = false;
      return group;
    };

    const moveGizmo = buildMoveGizmo();
    const scaleGizmo = buildScaleGizmo();
    const rotateGizmo = buildRotateGizmo();
    scene.add(moveGizmo, scaleGizmo, rotateGizmo);
    gizmoGroupsRef.current = { move: moveGizmo, scale: scaleGizmo, rotate: rotateGizmo };

    updateCameraPosition();

    // ---------------- resize ----------------
    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // ---------------- mouse interaction ----------------
    const raycaster = raycasterRef.current;
    const ndc = new THREE.Vector2();
    const setNdc = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const getAxisPlane = (axisDir, point) => {
      const viewDir = new THREE.Vector3();
      camera.getWorldDirection(viewDir);
      const temp = new THREE.Vector3().crossVectors(axisDir, viewDir);
      let normal;
      if (temp.lengthSq() < 1e-6) {
        normal = viewDir.clone();
      } else {
        normal = new THREE.Vector3().crossVectors(temp, axisDir).normalize();
      }
      return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
    };

    const onMouseDown = (e) => {
      if (playModeRef.current) return;
      setNdc(e);
      raycaster.setFromCamera(ndc, camera);

      if (e.button === 2) {
        dragRef.current = { type: "orbit", lastX: e.clientX, lastY: e.clientY };
        return;
      }
      if (e.button === 1) {
        dragRef.current = { type: "pan", lastX: e.clientX, lastY: e.clientY };
        return;
      }
      if (e.button !== 0) return;

      const activeGizmo = gizmoGroupsRef.current[toolRef.current];
      if (activeGizmo && activeGizmo.visible && selectedIdRef.current != null) {
        const hits = raycaster.intersectObjects(activeGizmo.children, true);
        if (hits.length) {
          const ud = hits[0].object.userData;
          const mesh = meshMapRef.current.get(selectedIdRef.current);
          const axisDir = AXIS_VEC[ud.axis];
          const center = mesh.position.clone();
          if (ud.mode === "move" || ud.mode === "scale") {
            const plane = getAxisPlane(axisDir, center);
            const p0 = new THREE.Vector3();
            raycaster.ray.intersectPlane(plane, p0);
            if (ud.mode === "move") {
              const tStart = p0 ? axisDir.dot(p0.clone().sub(center)) : 0;
              dragRef.current = { type: "moveAxis", axis: ud.axis, plane, center, tStart, startPos: mesh.position.clone(), mesh };
            } else {
              const tStart = p0 ? axisDir.dot(p0.clone().sub(center)) : 0;
              dragRef.current = { type: "scaleAxis", axis: ud.axis, plane, center, tStart, startScale: mesh.scale.clone(), mesh };
            }
          } else if (ud.mode === "rotate") {
            // rotation needs a plane PERPENDICULAR to the axis (the ring's own plane), not the
            // camera-facing plane used for move/scale — using the wrong plane is what made rotate feel broken.
            const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(axisDir, center);
            const p0 = new THREE.Vector3();
            raycaster.ray.intersectPlane(plane, p0);
            let helper = Math.abs(axisDir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
            const w = new THREE.Vector3().crossVectors(axisDir, helper).normalize();
            const u = new THREE.Vector3().crossVectors(w, axisDir).normalize();
            const v = p0 ? p0.clone().sub(center) : new THREE.Vector3();
            const startAngle = Math.atan2(v.dot(w), v.dot(u));
            dragRef.current = {
              type: "rotateAxis",
              axis: ud.axis,
              plane,
              center,
              u,
              w,
              prevAngle: startAngle,
              accumAngle: 0,
              startQuaternion: mesh.quaternion.clone(),
              mesh,
            };
          }
          return;
        }
      }

      const meshes = Array.from(meshMapRef.current.values()).filter((m) => m.visible);
      const hits = raycaster.intersectObjects(meshes);
      if (hits.length) {
        const hitMesh = hits[0].object;
        let hitId = null;
        for (const [id, m] of meshMapRef.current.entries()) if (m === hitMesh) hitId = id;
        selectObject(hitId);
        if (toolRef.current === "select" || toolRef.current === "move") {
          const planeY = hitMesh.position.y;
          const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
          const p0 = new THREE.Vector3();
          raycaster.ray.intersectPlane(plane, p0);
          if (p0) {
            dragRef.current = {
              type: "moveFree",
              mesh: hitMesh,
              plane,
              grabOffsetX: p0.x - hitMesh.position.x,
              grabOffsetZ: p0.z - hitMesh.position.z,
            };
          }
        }
      } else {
        selectObject(null);
      }
    };

    const onMouseMove = (e) => {
      const drag = dragRef.current;
      if (!drag || !drag.type) return;
      const cs = camStateRef.current;

      if (drag.type === "orbit") {
        const dx = e.clientX - drag.lastX;
        const dy = e.clientY - drag.lastY;
        cs.theta -= dx * 0.006;
        cs.phi = Math.min(Math.PI - 0.05, Math.max(0.05, cs.phi - dy * 0.006));
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;
        updateCameraPosition();
        return;
      }
      if (drag.type === "pan") {
        const dx = e.clientX - drag.lastX;
        const dy = e.clientY - drag.lastY;
        const right = new THREE.Vector3();
        camera.getWorldDirection(right);
        right.cross(camera.up).normalize();
        const up = camera.up.clone();
        const panScale = cs.radius * 0.0016;
        cs.target.addScaledVector(right, -dx * panScale);
        cs.target.addScaledVector(up, dy * panScale);
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;
        updateCameraPosition();
        return;
      }

      setNdc(e);
      raycaster.setFromCamera(ndc, camera);

      if (drag.type === "moveFree") {
        const p0 = new THREE.Vector3();
        const hit = raycaster.ray.intersectPlane(drag.plane, p0);
        if (hit) {
          const step = snapRef.current.move;
          drag.mesh.position.x = snapValue(p0.x - drag.grabOffsetX, step);
          drag.mesh.position.z = snapValue(p0.z - drag.grabOffsetZ, step);
          setTransform(readTransform(drag.mesh));
        }
      } else if (drag.type === "moveAxis") {
        const p0 = new THREE.Vector3();
        const hit = raycaster.ray.intersectPlane(drag.plane, p0);
        if (hit) {
          const axisDir = AXIS_VEC[drag.axis];
          const t = axisDir.dot(p0.clone().sub(drag.center));
          const delta = t - drag.tStart;
          const rawPos = drag.startPos.clone().addScaledVector(axisDir, delta);
          const step = snapRef.current.move;
          if (step > 0) {
            rawPos.x = snapValue(rawPos.x, step);
            rawPos.y = snapValue(rawPos.y, step);
            rawPos.z = snapValue(rawPos.z, step);
          }
          drag.mesh.position.copy(rawPos);
          setTransform(readTransform(drag.mesh));
        }
      } else if (drag.type === "scaleAxis") {
        const p0 = new THREE.Vector3();
        const hit = raycaster.ray.intersectPlane(drag.plane, p0);
        if (hit) {
          const axisDir = AXIS_VEC[drag.axis];
          const t = axisDir.dot(p0.clone().sub(drag.center));
          const delta = t - drag.tStart;
          const raw = drag.startScale[drag.axis] + delta;
          const newVal = Math.max(0.05, snapValue(raw, snapRef.current.scale));
          drag.mesh.scale[drag.axis] = newVal;
          setTransform(readTransform(drag.mesh));
        }
      } else if (drag.type === "rotateAxis") {
        const p0 = new THREE.Vector3();
        const hit = raycaster.ray.intersectPlane(drag.plane, p0);
        if (hit) {
          const v = p0.clone().sub(drag.center);
          const angle = Math.atan2(v.dot(drag.w), v.dot(drag.u));
          let deltaAngle = angle - drag.prevAngle;
          if (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2;
          if (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;
          drag.accumAngle += deltaAngle;
          drag.prevAngle = angle;
          const rotateStep = snapRef.current.rotate;
          const appliedAngle = rotateStep > 0 ? snapValue(drag.accumAngle, degToRad(rotateStep)) : drag.accumAngle;
          drag.mesh.quaternion.copy(drag.startQuaternion);
          drag.mesh.rotateOnWorldAxis(AXIS_VEC[drag.axis], appliedAngle);
          setTransform(readTransform(drag.mesh));
        }
      }
    };

    const onMouseUp = () => {
      dragRef.current = { type: null };
    };

    const onWheel = (e) => {
      e.preventDefault();
      const cs = camStateRef.current;
      cs.radius *= 1 + e.deltaY * 0.001;
      cs.radius = Math.min(300, Math.max(3, cs.radius));
      updateCameraPosition();
    };

    const onContextMenu = (e) => e.preventDefault();

    const dom = renderer.domElement;
    dom.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    dom.addEventListener("wheel", onWheel, { passive: false });
    dom.addEventListener("contextmenu", onContextMenu);

    const flyKeys = ["w", "a", "s", "d", "q", "e"];
    const onKeyDown = (e) => {
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const k = e.key.toLowerCase();
      if (flyKeys.includes(k)) keysRef.current[k] = true;
      if (e.key === "Shift") keysRef.current.shift = true;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIdRef.current != null && !playModeRef.current) {
        deleteObject(selectedIdRef.current);
      }
      if (e.key === "Escape") selectObject(null);
    };
    const onKeyUp = (e) => {
      const k = e.key.toLowerCase();
      if (flyKeys.includes(k)) keysRef.current[k] = false;
      if (e.key === "Shift") keysRef.current.shift = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    const onBlur = () => { keysRef.current = {}; };
    window.addEventListener("blur", onBlur);

    // ---------------- render loop ----------------
    lastTimeRef.current = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;

      // WASD/QE flycam
      const keys = keysRef.current;
      if (keys.w || keys.a || keys.s || keys.d || keys.q || keys.e) {
        const cs = camStateRef.current;
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        if (forward.lengthSq() > 0.0001) forward.normalize();
        const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
        const speed = Math.max(6, cs.radius) * 0.9 * (keys.shift ? 2.5 : 1) * dt;
        const move = new THREE.Vector3();
        if (keys.w) move.add(forward);
        if (keys.s) move.addScaledVector(forward, -1);
        if (keys.d) move.add(right);
        if (keys.a) move.addScaledVector(right, -1);
        if (keys.e) move.y += 1;
        if (keys.q) move.y -= 1;
        if (move.lengthSq() > 0) {
          move.normalize().multiplyScalar(speed);
          cs.target.add(move);
          updateCameraPosition();
        }
      }

      if (boxHelperRef.current) boxHelperRef.current.update();
      const selId = selectedIdRef.current;
      if (selId != null) {
        const mesh = meshMapRef.current.get(selId);
        if (mesh) {
          const dist = camera.position.distanceTo(mesh.position);
          const gscale = dist * 0.09;
          Object.values(gizmoGroupsRef.current).forEach((g) => {
            g.position.copy(mesh.position);
            g.scale.setScalar(gscale);
          });
        }
      }

      // apply Weld / Bone rigid constraints: Part1 follows Part0 at a fixed offset
      const trees = extraTreesRef.current;
      if (trees) {
        Object.values(trees).forEach((list) => {
          treeForEach(list, (node) => {
            if ((node.type === "weld" || node.type === "bone") && node.props && node.props.offset && node.props.part0 != null && node.props.part1 != null) {
              const m0 = meshMapRef.current.get(node.props.part0);
              const m1 = meshMapRef.current.get(node.props.part1);
              if (m0 && m1) {
                m1.position.set(m0.position.x + node.props.offset.x, m0.position.y + node.props.offset.y, m0.position.z + node.props.offset.z);
              }
            }
          });
        });
      }

      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      dom.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      dom.removeEventListener("wheel", onWheel);
      dom.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // switch gizmo visibility when tool changes
  useEffect(() => {
    showGizmoForTool(tool);
  }, [tool, showGizmoForTool]);

  const togglePlay = () => {
    const next = !playMode;
    if (next) {
      selectObject(null);
      // look for a rig template in StarterPlayer and spawn a live copy into Workspace to test with
      const rigNode = findRigNode(extraTrees.StarterPlayer || []);
      const templateParts = rigNode ? objects.filter((o) => o.parentExtraId === rigNode.id) : [];
      if (rigNode && templateParts.length) {
        const newModelId = nextId();
        const humanoid = { id: nextId(), type: "humanoid", name: "Humanoid", children: [], props: { ...(DEFAULT_PROPS.humanoid || {}) } };
        const model = { id: newModelId, type: "model", name: "TestPlayer", children: [humanoid], props: {} };
        setExtraTrees((prev) => ({ ...prev, Workspace: [...prev.Workspace, model] }));
        setExpanded((prev) => ({ ...prev, workspace: true }));
        setExpandedExtra((prev) => ({ ...prev, [newModelId]: true }));

        const clonedIds = [];
        let anchorPos = null;
        const clones = templateParts.map((meta) => {
          const originalMesh = meshMapRef.current.get(meta.id);
          const newId = nextId();
          const geometry = createGeometry(meta.type);
          const material = originalMesh ? originalMesh.material.clone() : new THREE.MeshStandardMaterial({ color: meta.color });
          const mesh = new THREE.Mesh(geometry, material);
          if (originalMesh) {
            mesh.scale.copy(originalMesh.scale);
            mesh.rotation.copy(originalMesh.rotation);
            mesh.position.copy(originalMesh.position);
          }
          mesh.castShadow = !material.transparent;
          mesh.receiveShadow = !material.transparent;
          sceneRef.current.add(mesh);
          meshMapRef.current.set(newId, mesh);
          clonedIds.push(newId);
          const lname = meta.name.trim().toLowerCase();
          if (lname === "humanoidrootpart" || lname === "torso") anchorPos = mesh.position.clone();
          return { id: newId, name: meta.name, type: meta.type, color: meta.color, material: meta.material, parentExtraId: newModelId, surfaceTexture: meta.surfaceTexture || "default" };
        });
        if (!anchorPos) {
          const firstMesh = meshMapRef.current.get(clonedIds[0]);
          if (firstMesh) anchorPos = firstMesh.position.clone();
        }
        setObjects((prev) => [...prev, ...clones]);

        const cs = camStateRef.current;
        testRigRef.current = {
          modelId: newModelId,
          partIds: clonedIds,
          prevCam: { target: cs.target.clone(), radius: cs.radius, theta: cs.theta, phi: cs.phi },
        };
        if (anchorPos) {
          cs.target.copy(anchorPos);
          cs.radius = Math.min(cs.radius, 10);
          updateCameraPosition();
        }
      } else {
        testRigRef.current = null;
      }
    } else {
      const rig = testRigRef.current;
      if (rig) {
        rig.partIds.forEach((id) => {
          const mesh = meshMapRef.current.get(id);
          if (mesh) {
            sceneRef.current.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
          }
          meshMapRef.current.delete(id);
        });
        setObjects((prev) => prev.filter((o) => !rig.partIds.includes(o.id)));
        setExtraTrees((prev) => ({ ...prev, Workspace: treeRemove(prev.Workspace, rig.modelId) }));
        if (rig.prevCam) {
          const cs = camStateRef.current;
          cs.target.copy(rig.prevCam.target);
          cs.radius = rig.prevCam.radius;
          cs.theta = rig.prevCam.theta;
          cs.phi = rig.prevCam.phi;
          updateCameraPosition();
        }
        testRigRef.current = null;
      }
      selectObject(null);
    }
    setPlayMode(next);
  };

  const selectedMeta = objects.find((o) => o.id === selectedId);
  const viewportFilter = collectLightingEffects(extraTrees);
  const guiElements = collectGuiElements(extraTrees);
  const workspacePartCount = objects.filter((o) => (o.parentExtraId == null ? true : findServiceOfExtraId(extraTrees, o.parentExtraId) === "Workspace")).length;

  const SERVICES = [
    { key: "Workspace", icon: <GlobeIcon /> },
    { key: "Lighting", icon: <SunIcon /> },
    { key: "StarterGui", icon: <FolderIcon badge="square" /> },
    { key: "StarterPlayer", icon: <FolderIcon badge="person" /> },
    { key: "Storage", icon: <FolderIcon badge="circle" /> },
  ];

  const extraCtx = {
    playMode,
    expandedExtra,
    toggleExpandedExtra,
    selectedExtra,
    selectExtra,
    addMenuTarget,
    setAddMenuTarget,
    addExtraNode,
    deleteExtraNode,
    renameExtraNode,
    moveExtraNode,
    renamingExtraId,
    setRenamingExtraId,
    dragExtraRef,
    dragOverKey,
    setDragOverKey,
    setContextMenu,
    objects,
    selectedId,
    renamingId,
    setRenamingId,
    dragPartIdRef,
    selectObject,
    setName,
    deleteObject,
    reorderParts,
    movePartToContainer,
    insertHumanoidRootPart,
  };

  // ----------------------------- render -----------------------------

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif', fontSize: 12, userSelect: "none" }}>
      {/* top bar */}
      <div style={{ display: "flex", alignItems: "center", height: 34, background: COLORS.topbar, borderBottom: "1px solid " + COLORS.border, padding: "0 10px", gap: 14, flexShrink: 0 }}>
        <div style={{ width: 16, height: 16, borderRadius: 3, background: "linear-gradient(135deg,#e05555,#4a90d9)" }} />
        <div style={{ fontWeight: 600, fontSize: 12.5 }}>My First Game — Studio</div>
        <div style={{ display: "flex", gap: 14, color: COLORS.textMuted, marginLeft: 8 }}>
          <span title="File menu">File</span>
          <span title="Community-made plugins that add tools and comfort features to the editor">Plugins</span>
          <span title="Studio-wide settings — rendering (OpenGL/Vulkan), lighting technology, performance">Studio</span>
          <span title="Import OBJ or FBX files into the scene">Import</span>
          <span title="Export parts or models as OBJ or FBX files">Export</span>
        </div>
      </div>

      {/* ribbon */}
      <div style={{ display: "flex", alignItems: "center", height: 46, background: COLORS.ribbon, borderBottom: "1px solid " + COLORS.border, padding: "0 8px", gap: 2, flexShrink: 0, overflowX: "auto" }}>
        <ToolButton title="Select (click parts)" active={tool === "select"} onClick={() => setTool("select")}>
          <SelectIcon /> Select
        </ToolButton>
        <ToolButton title="Move — drag the colored arrows" active={tool === "move"} onClick={() => setTool("move")}>
          <MoveIcon /> Move
        </ToolButton>
        <ToolButton title="Scale — drag the colored handles" active={tool === "scale"} onClick={() => setTool("scale")}>
          <ScaleIcon /> Scale
        </ToolButton>
        <ToolButton title="Rotate — drag the colored rings" active={tool === "rotate"} onClick={() => setTool("rotate")}>
          <RotateIcon /> Rotate
        </ToolButton>
        <Divider />
        <ToolButton title="Insert a Block" onClick={() => insertPart("block")}>▢ Block</ToolButton>
        <ToolButton title="Insert a Sphere" onClick={() => insertPart("sphere")}>○ Sphere</ToolButton>
        <ToolButton title="Insert a Cylinder" onClick={() => insertPart("cylinder")}>⬭ Cylinder</ToolButton>
        <ToolButton title="Insert a Wedge" onClick={() => insertPart("wedge")}>◺ Wedge</ToolButton>
        <div ref={rigButtonRef} style={{ position: "relative" }}>
          <ToolButton
            title="Build a humanoid rig"
            active={rigMenuOpen}
            onClick={() => {
              if (!rigMenuOpen && rigButtonRef.current) {
                const rect = rigButtonRef.current.getBoundingClientRect();
                setRigMenuPos({ left: rect.left, top: rect.bottom + 4 });
              }
              setRigMenuOpen((o) => !o);
            }}
          >
            🦴 Rig ▾
          </ToolButton>
        </div>
        <Divider />
        <SnapButton label="Move" unit="stud" options={[0, 1, 0.5]} value={snap.move} onChange={(v) => setSnap((s) => ({ ...s, move: v }))} />
        <SnapButton label="Rotate" unit="°" options={[0, 15, 45, 90]} value={snap.rotate} onChange={(v) => setSnap((s) => ({ ...s, rotate: v }))} />
        <SnapButton label="Scale" unit="stud" options={[0, 1, 0.5, 0.25]} value={snap.scale} onChange={(v) => setSnap((s) => ({ ...s, scale: v }))} />
        <Divider />
        <ToolButton
          title={playMode ? "Stop testing" : "Play — test your place"}
          active={playMode}
          onClick={togglePlay}
        >
          {playMode ? <StopIcon /> : <PlayIcon />} {playMode ? "Stop" : "Play"}
        </ToolButton>
      </div>

      {/* body */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* explorer */}
        <div style={{ width: 230, background: COLORS.panel, borderRight: "1px solid " + COLORS.border, display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ background: COLORS.panelHeader, padding: "6px 10px", fontWeight: 600, borderBottom: "1px solid " + COLORS.border }}>Explorer</div>
          <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
            {SERVICES.map((svc) => (
              <React.Fragment key={svc.key}>
                <ServiceRow
                  icon={svc.icon}
                  label={svc.key}
                  selected={selectedService === svc.key}
                  expandable
                  expanded={!!expanded[svc.key.toLowerCase()]}
                  onToggle={() => toggleExpanded(svc.key.toLowerCase())}
                  onClick={() => !playMode && selectService(svc.key)}
                  onAdd={() => !playMode && setAddMenuTarget({ service: svc.key, parentId: null })}
                  onContextMenu={(e) => { e.preventDefault(); if (!playMode) setContextMenu({ x: e.clientX, y: e.clientY, target: { kind: "service", service: svc.key } }); }}
                  isDragOver={dragOverKey === svc.key}
                  onDragOverHere={(e) => { e.preventDefault(); if (dragOverKey !== svc.key) setDragOverKey(svc.key); }}
                  onDragLeaveHere={() => setDragOverKey((k) => (k === svc.key ? null : k))}
                  onDropHere={(e) => {
                    e.preventDefault();
                    if (dragExtraRef.current) {
                      moveExtraNode(dragExtraRef.current.service, dragExtraRef.current.id, svc.key, null);
                      dragExtraRef.current = null;
                    } else if (dragPartIdRef.current != null && svc.key === "Workspace") {
                      movePartToContainer(dragPartIdRef.current, null);
                      dragPartIdRef.current = null;
                    }
                    setDragOverKey(null);
                  }}
                />
                {addMenuTarget && addMenuTarget.service === svc.key && addMenuTarget.parentId === null && (
                  <AddMenuRow
                    depth={1}
                    types={getAllowedTypes(svc.key, null)}
                    onPick={(type) => (type === "humanoidrootpart" ? insertHumanoidRootPart(null, svc.key) : addExtraNode(svc.key, null, type))}
                    onCancel={() => setAddMenuTarget(null)}
                  />
                )}
                {expanded[svc.key.toLowerCase()] && (
                  <>
                    {svc.key === "Workspace" && (
                      <>
                        <div
                          onClick={() => !playMode && selectService("Camera")}
                          onDragOver={(e) => { e.preventDefault(); if (dragOverKey !== "camera") setDragOverKey("camera"); }}
                          onDragLeave={() => setDragOverKey((k) => (k === "camera" ? null : k))}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (dragExtraRef.current) {
                              moveExtraNode(dragExtraRef.current.service, dragExtraRef.current.id, "Workspace", null);
                              dragExtraRef.current = null;
                            }
                            setDragOverKey(null);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "3px 10px 3px 30px",
                            background: selectedService === "Camera" ? COLORS.btnActive : "transparent",
                            cursor: "pointer",
                            borderBottom: dragOverKey === "camera" ? "2px solid " + COLORS.accent : "2px solid transparent",
                            boxSizing: "border-box",
                          }}
                        >
                          <span style={{ width: 10, flexShrink: 0 }} />
                          <span style={ICON_SLOT_STYLE}>📷</span>
                          <span style={{ flex: 1 }}>Camera</span>
                          <span
                            onClick={(e) => { e.stopPropagation(); if (!playMode) setAddMenuTarget({ service: "Workspace", parentId: null }); }}
                            style={{ opacity: 0.6, display: "flex" }}
                            title="Add"
                          >
                            <PlusIcon />
                          </span>
                        </div>
                        {objects.filter((o) => o.parentExtraId == null).map((o) => (
                          <PartRow key={o.id} o={o} depth={1} ctx={extraCtx} />
                        ))}
                      </>
                    )}
                    <ExtraTree nodes={extraTrees[svc.key]} service={svc.key} depth={1} ctx={extraCtx} />
                  </>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* viewport / script editor */}
        <div style={{ flex: 1, position: "relative", minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", background: COLORS.panelHeader, borderBottom: "1px solid " + COLORS.border, flexShrink: 0 }}>
            <TabButton active={centerTab === "viewport"} onClick={() => setCenterTab("viewport")}>🖥️ Viewport</TabButton>
            {openScript && (() => {
              const scriptNode = treeFind(extraTrees[openScript.service] || [], openScript.id);
              return (
                <TabButton active={centerTab === "script"} onClick={() => setCenterTab("script")}>
                  📝 {scriptNode ? scriptNode.name : "Script"}
                  <span
                    onClick={(e) => { e.stopPropagation(); setOpenScript(null); setCenterTab("viewport"); }}
                    style={{ marginLeft: 8, opacity: 0.6 }}
                    title="Close"
                  >
                    ✕
                  </span>
                </TabButton>
              );
            })()}
          </div>

          <div style={{ flex: 1, position: "relative", minWidth: 0, overflow: "hidden", display: centerTab === "viewport" ? "block" : "none" }}>
            <div ref={mountRef} style={{ position: "absolute", inset: 0, filter: viewportFilter }} />
            <ScreenGuiOverlay elements={guiElements} selectedExtra={selectedExtra} selectExtra={selectExtra} setExtraProp={setExtraProp} playMode={playMode} />
            <div style={{ position: "absolute", left: 10, bottom: 10, color: "rgba(255,255,255,0.75)", fontSize: 11, background: "rgba(0,0,0,0.35)", padding: "5px 9px", borderRadius: 4, lineHeight: 1.5 }}>
              Left-click: select / drag &nbsp;•&nbsp; Right-drag: orbit &nbsp;•&nbsp; Middle-drag: pan &nbsp;•&nbsp; Scroll: zoom &nbsp;•&nbsp; WASD/QE: fly camera
            </div>
            {playMode && (
              <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", background: "#c0392b", padding: "4px 14px", borderRadius: 4, fontWeight: 600, letterSpacing: 0.3 }}>
                Testing
              </div>
            )}
            {fireToast && (
              <div style={{ position: "absolute", right: 10, bottom: 10, background: "rgba(224,123,40,0.9)", padding: "5px 10px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
                {fireToast}
              </div>
            )}
          </div>

          {centerTab === "script" && openScript && (() => {
            const scriptNode = treeFind(extraTrees[openScript.service] || [], openScript.id);
            if (!scriptNode) {
              return (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.textMuted }}>
                  This script was deleted.
                </div>
              );
            }
            const sprops = scriptNode.props || {};
            return (
              <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: 12, gap: 10, background: COLORS.bg }}>
                <div style={{ color: COLORS.textMuted, fontSize: 12 }}>
                  {scriptNode.name} — {(TYPE_META.script && "Script")} · {(sprops.language || "luau").toUpperCase()}
                </div>
                <textarea
                  disabled={playMode}
                  value={sprops.code || ""}
                  onChange={(e) => setExtraProp(openScript.service, openScript.id, "code", e.target.value)}
                  spellCheck={false}
                  style={{ flex: 1, width: "100%", boxSizing: "border-box", background: "#1c1c1c", color: COLORS.text, border: "1px solid " + COLORS.border, borderRadius: 4, padding: 10, fontFamily: "Consolas, monospace", fontSize: 13, resize: "none" }}
                />
                <div style={{ display: "flex", gap: 6 }}>
                  <button disabled={playMode} onClick={() => openScriptExternally("vscode")} style={{ ...typeBtnStyle, flexDirection: "row", flex: 1, width: "auto" }}>
                    🔵 VS Code
                  </button>
                  <button disabled={playMode} onClick={() => openScriptExternally("vs2026")} style={{ ...typeBtnStyle, flexDirection: "row", flex: 1, width: "auto" }}>
                    🟣 Visual Studio
                  </button>
                  <button onClick={() => copyScriptCode(sprops.code)} style={{ ...typeBtnStyle, flexDirection: "row", flex: 1, width: "auto" }}>
                    📋 Copy
                  </button>
                </div>
                <div style={{ color: COLORS.textMuted, fontSize: 11, lineHeight: 1.4 }}>
                  Opening an external editor needs it installed locally with its link handler enabled — this may not work in every browser.
                </div>
              </div>
            );
          })()}
        </div>

        {/* properties */}
        <div style={{ width: 250, background: COLORS.panel, borderLeft: "1px solid " + COLORS.border, display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto" }}>
          <div style={{ background: COLORS.panelHeader, padding: "6px 10px", fontWeight: 600, borderBottom: "1px solid " + COLORS.border }}>Properties</div>
          {selectedService === "Lighting" ? (
            <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ color: COLORS.textMuted, lineHeight: 1.5, marginBottom: 2 }}>Controls the sun and ambient light for the whole scene.</div>
              <PropField label={`Brightness (${lighting.brightness})`}>
                <input type="range" min="0" max="3" step="0.05" disabled={playMode} value={lighting.brightness} onChange={(e) => setLightingField("brightness", e.target.value)} style={{ width: "100%" }} />
              </PropField>
              <PropField label={`Ambient (${lighting.ambient})`}>
                <input type="range" min="0" max="3" step="0.05" disabled={playMode} value={lighting.ambient} onChange={(e) => setLightingField("ambient", e.target.value)} style={{ width: "100%" }} />
              </PropField>
              <PropField label="Color">
                <input
                  type="color"
                  disabled={playMode}
                  value={lighting.color}
                  onChange={(e) => setLightingField("color", e.target.value)}
                  style={{ width: "100%", height: 26, background: "#1c1c1c", border: "1px solid " + COLORS.border, borderRadius: 3 }}
                />
              </PropField>
            </div>
          ) : selectedService === "Camera" ? (
            <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ color: COLORS.textMuted, lineHeight: 1.5, marginBottom: 2 }}>Controls how wide the editor viewport sees the scene.</div>
              <PropField label={`Field of View (${cameraFov}°)`}>
                <input type="range" min="10" max="120" step="1" disabled={playMode} value={cameraFov} onChange={(e) => setCameraField(e.target.value)} style={{ width: "100%" }} />
              </PropField>
            </div>
          ) : selectedExtra ? (
            (() => {
              const node = treeFind(extraTrees[selectedExtra.service], selectedExtra.id);
              if (!node) return <div style={{ padding: 14, color: COLORS.textMuted }}>Item not found.</div>;
              const svc = selectedExtra.service;
              const props = node.props || {};
              return (
                <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 12 }}>
                  <PropField label="Name">
                    <input
                      disabled={playMode}
                      value={node.name}
                      onChange={(e) => renameExtraNode(svc, node.id, e.target.value)}
                      style={inputStyle}
                    />
                  </PropField>

                  {node.type === "folder" && (
                    <div style={{ color: COLORS.textMuted, lineHeight: 1.5 }}>A folder for organizing other items.</div>
                  )}

                  {node.type === "text" && (
                    <PropField label="Text">
                      <input disabled={playMode} value={props.text || ""} onChange={(e) => setExtraProp(svc, node.id, "text", e.target.value)} style={inputStyle} />
                    </PropField>
                  )}

                  {node.type === "value" && (
                    <PropField label="Value">
                      <input disabled={playMode} value={props.value ?? ""} onChange={(e) => setExtraProp(svc, node.id, "value", e.target.value)} style={inputStyle} />
                    </PropField>
                  )}

                  {node.type === "bool" && (
                    <PropField label="Value">
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: playMode ? "default" : "pointer" }}>
                        <input
                          type="checkbox"
                          disabled={playMode}
                          checked={!!props.value}
                          onChange={(e) => setExtraProp(svc, node.id, "value", e.target.checked)}
                        />
                        {props.value ? "true" : "false"}
                      </label>
                    </PropField>
                  )}

                  {node.type === "blur" && (
                    <>
                      <PropField label="Enabled">
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: playMode ? "default" : "pointer" }}>
                          <input
                            type="checkbox"
                            disabled={playMode}
                            checked={!!props.enabled}
                            onChange={(e) => setExtraProp(svc, node.id, "enabled", e.target.checked)}
                          />
                          Blurs the viewport
                        </label>
                      </PropField>
                      <PropField label={`Size (${props.size ?? 0}px)`}>
                        <input
                          type="range"
                          min="0"
                          max="24"
                          step="1"
                          disabled={playMode}
                          value={props.size ?? 0}
                          onChange={(e) => setExtraProp(svc, node.id, "size", parseFloat(e.target.value))}
                          style={{ width: "100%" }}
                        />
                      </PropField>
                    </>
                  )}

                  {node.type === "bloom" && (
                    <>
                      <PropField label="Enabled">
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: playMode ? "default" : "pointer" }}>
                          <input
                            type="checkbox"
                            disabled={playMode}
                            checked={!!props.enabled}
                            onChange={(e) => setExtraProp(svc, node.id, "enabled", e.target.checked)}
                          />
                          Glows bright areas of the viewport
                        </label>
                      </PropField>
                      <PropField label={`Intensity (${props.intensity ?? 0})`}>
                        <input
                          type="range"
                          min="0"
                          max="3"
                          step="0.1"
                          disabled={playMode}
                          value={props.intensity ?? 0}
                          onChange={(e) => setExtraProp(svc, node.id, "intensity", parseFloat(e.target.value))}
                          style={{ width: "100%" }}
                        />
                      </PropField>
                    </>
                  )}

                  {node.type === "grayscale" && (
                    <>
                      <PropField label="Enabled">
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: playMode ? "default" : "pointer" }}>
                          <input
                            type="checkbox"
                            disabled={playMode}
                            checked={!!props.enabled}
                            onChange={(e) => setExtraProp(svc, node.id, "enabled", e.target.checked)}
                          />
                          Desaturates the viewport
                        </label>
                      </PropField>
                      <PropField label={`Amount (${props.amount ?? 0}%)`}>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          disabled={playMode}
                          value={props.amount ?? 0}
                          onChange={(e) => setExtraProp(svc, node.id, "amount", parseFloat(e.target.value))}
                          style={{ width: "100%" }}
                        />
                      </PropField>
                      <div style={{ color: COLORS.textMuted, fontSize: 11 }}>0% is normal color, 100% is fully black &amp; white.</div>
                    </>
                  )}

                  {node.type === "uicorner" && (
                    <PropField label={`Radius (${props.radius ?? 0}px)`}>
                      <input
                        type="range"
                        min="0"
                        max="80"
                        step="1"
                        disabled={playMode}
                        value={props.radius ?? 0}
                        onChange={(e) => setExtraProp(svc, node.id, "radius", parseFloat(e.target.value))}
                        style={{ width: "100%" }}
                      />
                    </PropField>
                  )}

                  {node.type === "uistroke" && (
                    <>
                      <PropField label="Color">
                        <input
                          type="color"
                          disabled={playMode}
                          value={props.color || "#000000"}
                          onChange={(e) => setExtraProp(svc, node.id, "color", e.target.value)}
                          style={{ width: "100%", height: 26, background: "#1c1c1c", border: "1px solid " + COLORS.border, borderRadius: 3 }}
                        />
                      </PropField>
                      <PropField label={`Thickness (${props.thickness ?? 0}px)`}>
                        <input
                          type="range"
                          min="0"
                          max="12"
                          step="1"
                          disabled={playMode}
                          value={props.thickness ?? 0}
                          onChange={(e) => setExtraProp(svc, node.id, "thickness", parseFloat(e.target.value))}
                          style={{ width: "100%" }}
                        />
                      </PropField>
                    </>
                  )}

                  {node.type === "remoteevent" && (
                    <>
                      <div style={{ color: COLORS.textMuted, lineHeight: 1.5 }}>Fires an event scripts could listen for.</div>
                      <button
                        disabled={playMode}
                        onClick={() => fireRemoteEvent(node.name)}
                        style={{ ...typeBtnStyle, width: "100%", flexDirection: "row", gap: 6 }}
                      >
                        🔥 Fire
                      </button>
                    </>
                  )}

                  {(node.type === "weld" || node.type === "bone") && (
                    <>
                      <div style={{ color: COLORS.textMuted, lineHeight: 1.5 }}>
                        {node.type === "weld" ? "Rigidly connects Part1 to Part0 — moving Part0 drags Part1 along." : "Links two parts together to help build a rig."}
                      </div>
                      <PropField label="Part0">
                        <select disabled={playMode} value={props.part0 ?? ""} onChange={(e) => setWeldPart(svc, node.id, "part0", e.target.value)} style={inputStyle}>
                          <option value="">— none —</option>
                          {objects.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      </PropField>
                      <PropField label="Part1">
                        <select disabled={playMode} value={props.part1 ?? ""} onChange={(e) => setWeldPart(svc, node.id, "part1", e.target.value)} style={inputStyle}>
                          <option value="">— none —</option>
                          {objects.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      </PropField>
                    </>
                  )}

                  {node.type === "humanoid" && (
                    <>
                      <PropField label={`Health (${props.health ?? 0}/${props.maxHealth ?? 100})`}>
                        <input
                          type="range"
                          min="0"
                          max={props.maxHealth ?? 100}
                          step="1"
                          disabled={playMode}
                          value={props.health ?? 0}
                          onChange={(e) => setExtraProp(svc, node.id, "health", parseFloat(e.target.value))}
                          style={{ width: "100%" }}
                        />
                      </PropField>
                      <PropField label="Max Health">
                        <input
                          type="number"
                          disabled={playMode}
                          value={props.maxHealth ?? 100}
                          onChange={(e) => setExtraProp(svc, node.id, "maxHealth", parseFloat(e.target.value))}
                          style={inputStyle}
                        />
                      </PropField>
                      <PropField label="Walk Speed">
                        <input
                          type="number"
                          disabled={playMode}
                          value={props.walkSpeed ?? 16}
                          onChange={(e) => setExtraProp(svc, node.id, "walkSpeed", parseFloat(e.target.value))}
                          style={inputStyle}
                        />
                      </PropField>
                    </>
                  )}

                  {node.type === "model" && (
                    <div style={{ color: COLORS.textMuted, lineHeight: 1.5 }}>A container for grouping parts together.</div>
                  )}

                  {node.type === "configuration" && (
                    <div style={{ color: COLORS.textMuted, lineHeight: 1.5 }}>Holds Value instances used to configure a system.</div>
                  )}

                  {node.type === "frame" && (
                    <div style={{ color: COLORS.textMuted, lineHeight: 1.5 }}>A rectangular container for other Gui instances.</div>
                  )}

                  {node.type === "button" && (
                    <PropField label="Text">
                      <input
                        disabled={playMode}
                        value={props.text ?? ""}
                        onChange={(e) => setExtraProp(svc, node.id, "text", e.target.value)}
                        style={inputStyle}
                      />
                    </PropField>
                  )}

                  {node.type === "gui" && (
                    <div style={{ color: COLORS.textMuted, lineHeight: 1.5 }}>A screen UI container — add Frames, Text, and Buttons inside it.</div>
                  )}

                  {node.type === "script" && (
                    <>
                      <PropField label="Language">
                        <select
                          disabled={playMode}
                          value={props.language || "luau"}
                          onChange={(e) => setExtraProp(svc, node.id, "language", e.target.value)}
                          style={inputStyle}
                        >
                          <option value="luau">Luau</option>
                          <option value="lua">Lua</option>
                          <option value="python">Python</option>
                          <option value="cpp">C++</option>
                        </select>
                      </PropField>
                      <button
                        onClick={() => { setOpenScript({ service: svc, id: node.id }); setCenterTab("script"); }}
                        style={{ ...typeBtnStyle, flexDirection: "row", width: "100%" }}
                      >
                        📝 Open Code Editor
                      </button>
                    </>
                  )}

                  {"color" in props && (
                    <PropField label="Color">
                      <input
                        type="color"
                        disabled={playMode}
                        value={props.color}
                        onChange={(e) => setExtraProp(svc, node.id, "color", e.target.value)}
                        style={{ width: "100%", height: 26, background: "#1c1c1c", border: "1px solid " + COLORS.border, borderRadius: 3 }}
                      />
                    </PropField>
                  )}
                </div>
              );
            })()
          ) : selectedService ? (
            <div style={{ padding: 14, color: COLORS.textMuted, lineHeight: 1.5 }}>{SERVICE_INFO[selectedService]}</div>
          ) : !selectedMeta || !transform ? (
            <div style={{ padding: 14, color: COLORS.textMuted, lineHeight: 1.5 }}>Select a part to view and edit its properties.</div>
          ) : (
            <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 12 }}>
              <PropField label="Name">
                <input
                  disabled={playMode}
                  value={selectedMeta.name}
                  onChange={(e) => setName(selectedMeta.id, e.target.value)}
                  style={inputStyle}
                />
              </PropField>

              <Vec3Field label="Position" values={transform.position} disabled={playMode} onChange={(axis, v) => setField("position", axis, v)} step={0.1} />
              <Vec3Field label="Size" values={transform.size} disabled={playMode} onChange={(axis, v) => setField("size", axis, v)} step={0.1} min={0.05} />
              <Vec3Field label="Rotation°" values={transform.rotationDeg} disabled={playMode} onChange={(axis, v) => setField("rotationDeg", axis, v)} step={1} />

              <PropField label="Color">
                <input
                  type="color"
                  disabled={playMode}
                  value={selectedMeta.color}
                  onChange={(e) => setColor(selectedMeta.id, e.target.value)}
                  style={{ width: "100%", height: 26, background: "#1c1c1c", border: "1px solid " + COLORS.border, borderRadius: 3 }}
                />
              </PropField>

              <PropField label="Material">
                <select
                  disabled={playMode}
                  value={selectedMeta.material}
                  onChange={(e) => setMaterial(selectedMeta.id, e.target.value)}
                  style={inputStyle}
                >
                  {MATERIALS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </PropField>

              <PropField label="Surface Texture">
                <select
                  disabled={playMode}
                  value={selectedMeta.surfaceTexture || "default"}
                  onChange={(e) => setSurfaceTexture(selectedMeta.id, e.target.value)}
                  style={inputStyle}
                >
                  <option value="default">Default</option>
                  <option value="stud">Stud</option>
                  <option value="faces">Faces</option>
                  <option value="grid">Grid</option>
                </select>
              </PropField>
            </div>
          )}
        </div>
      </div>

      {/* status bar */}
      <div style={{ height: 22, background: COLORS.statusBar, display: "flex", alignItems: "center", padding: "0 10px", fontSize: 11, flexShrink: 0, gap: 16 }}>
        <span>{selectedMeta ? `Selected: ${selectedMeta.name}` : selectedService ? `Selected: ${selectedService}` : selectedExtra ? "Selected: item" : "No selection"}</span>
        <span>Tool: {tool}</span>
        <span style={{ marginLeft: "auto" }}>{workspacePartCount} part{workspacePartCount === 1 ? "" : "s"} in Workspace</span>
      </div>

      <ContextMenu menu={contextMenu} clipboard={clipboard} onAction={handleContextAction} onClose={closeContextMenu} />
      <MoveToPicker target={moveToTarget} options={collectContainerOptions(extraTrees)} onPick={performMoveTo} onCancel={() => setMoveToTarget(null)} />
      {rigMenuOpen && (
        <>
          <div onClick={() => setRigMenuOpen(false)} onContextMenu={(e) => { e.preventDefault(); setRigMenuOpen(false); }} style={{ position: "fixed", inset: 0, zIndex: 99998 }} />
          <div style={{ position: "fixed", left: rigMenuPos.left, top: rigMenuPos.top, background: COLORS.panel, border: "1px solid " + COLORS.border, borderRadius: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.6)", zIndex: 99999, minWidth: 190, padding: "4px 0" }}>
            <MenuItem label="R15 — 15-part rig" onClick={() => { createRig("r15"); setRigMenuOpen(false); }} />
            <MenuItem label="R6 — classic 6-part rig" onClick={() => { createRig("r6"); setRigMenuOpen(false); }} />
          </div>
        </>
      )}
    </div>
  );
}

function darkenColor(hex, amount) {
  const c = (hex || "#888888").replace("#", "");
  const full = c.length === 3 ? c.split("").map((ch) => ch + ch).join("") : c;
  const num = parseInt(full, 16) || 0x888888;
  let r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  r = Math.max(0, Math.round(r * (1 - amount)));
  g = Math.max(0, Math.round(g * (1 - amount)));
  b = Math.max(0, Math.round(b * (1 - amount)));
  return `rgb(${r},${g},${b})`;
}

function collectGuiElements(trees) {
  const out = [];
  Object.entries(trees).forEach(([service, list]) => {
    treeForEach(list, (n) => {
      if (n.type === "frame" || n.type === "button" || n.type === "text") out.push({ service, node: n });
    });
  });
  return out;
}

function ResizeHandle({ onStart }) {
  return (
    <div
      onMouseDown={onStart}
      title="Drag to resize"
      style={{
        position: "absolute",
        right: -5,
        bottom: -5,
        width: 11,
        height: 11,
        background: COLORS.accent,
        border: "1px solid #fff",
        borderRadius: 2,
        cursor: "nwse-resize",
        pointerEvents: "auto",
      }}
    />
  );
}

function RotateHandle({ onStart }) {
  return (
    <>
      <div style={{ position: "absolute", left: "50%", top: -22, width: 1, height: 18, background: COLORS.accent, transform: "translateX(-50%)" }} />
      <div
        onMouseDown={onStart}
        title="Drag to rotate"
        style={{
          position: "absolute",
          left: "50%",
          top: -30,
          width: 12,
          height: 12,
          marginLeft: -6,
          borderRadius: "50%",
          background: COLORS.accent,
          border: "1px solid #fff",
          cursor: "grab",
          pointerEvents: "auto",
        }}
      />
    </>
  );
}

function ScreenGuiOverlay({ elements, selectedExtra, selectExtra, setExtraProp, playMode }) {
  const overlayRef = useRef(null);
  const resizeRef = useRef(null);
  const moveRef = useRef(null);
  const rotateRef = useRef(null);
  const [pressedId, setPressedId] = useState(null);

  useEffect(() => {
    const onMove = (e) => {
      const rz = resizeRef.current;
      if (rz) {
        const dx = e.clientX - rz.startX;
        const dy = e.clientY - rz.startY;
        let newW = rz.startW;
        let newH = rz.startH;
        if (e.shiftKey) {
          // shift = resize one dimension at a time (whichever way you're actually dragging),
          // for more precise sizing instead of width and height changing together
          if (Math.abs(dx) >= Math.abs(dy)) newW = Math.max(30, rz.startW + dx);
          else newH = Math.max(20, rz.startH + dy);
        } else {
          newW = Math.max(30, rz.startW + dx);
          newH = Math.max(20, rz.startH + dy);
        }
        setExtraProp(rz.service, rz.id, "width", newW);
        setExtraProp(rz.service, rz.id, "height", newH);
        return;
      }
      const mv = moveRef.current;
      if (mv) {
        const dx = e.clientX - mv.startClientX;
        const dy = e.clientY - mv.startClientY;
        if (Math.abs(dx) + Math.abs(dy) > 4) mv.moved = true;
        setExtraProp(mv.service, mv.id, "x", mv.startX + dx);
        setExtraProp(mv.service, mv.id, "y", mv.startY + dy);
        return;
      }
      const rt = rotateRef.current;
      if (rt) {
        const angle = (Math.atan2(e.clientY - rt.centerY, e.clientX - rt.centerX) * 180) / Math.PI + 90;
        setExtraProp(rt.service, rt.id, "rotation", Math.round(angle));
      }
    };
    const onUp = () => {
      resizeRef.current = null;
      rotateRef.current = null;
      if (moveRef.current && !moveRef.current.moved) {
        selectExtra(moveRef.current.service, moveRef.current.id);
      }
      moveRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [setExtraProp, selectExtra]);

  const startResize = (e, service, node, w, h) => {
    e.stopPropagation();
    e.preventDefault();
    resizeRef.current = {
      service,
      id: node.id,
      startX: e.clientX,
      startY: e.clientY,
      startW: w,
      startH: h,
      startPropX: node.props.x || 0,
      startPropY: node.props.y || 0,
    };
  };

  const startMove = (e, service, node) => {
    if (playMode) return;
    e.stopPropagation();
    moveRef.current = {
      service,
      id: node.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: node.props.x || 0,
      startY: node.props.y || 0,
      moved: false,
    };
  };

  const startRotate = (e, service, node, x, y) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = overlayRef.current.getBoundingClientRect();
    rotateRef.current = {
      service,
      id: node.id,
      centerX: rect.left + rect.width / 2 + x,
      centerY: rect.top + rect.height / 2 + y,
    };
  };

  return (
    <div ref={overlayRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {elements.map(({ service, node }) => {
        const isSelected = selectedExtra && selectedExtra.id === node.id;
        const w = node.props.width || 200;
        const h = node.props.height || (node.type === "text" ? 40 : node.type === "button" ? 44 : 150);
        const x = node.props.x || 0;
        const y = node.props.y || 0;
        const rotation = node.props.rotation || 0;
        const common = {
          position: "absolute",
          left: `calc(50% + ${x}px)`,
          top: `calc(50% + ${y}px)`,
          transform: `translate(-50%,-50%) rotate(${rotation}deg)`,
          width: w,
          height: h,
          boxSizing: "border-box",
          pointerEvents: playMode ? "none" : "auto",
          outline: isSelected ? "2px solid " + COLORS.accent : "none",
          outlineOffset: 2,
          cursor: playMode ? "default" : "move",
        };
        const handles = isSelected && !playMode && (
          <>
            <ResizeHandle onStart={(e) => startResize(e, service, node, w, h)} />
            <RotateHandle onStart={(e) => startRotate(e, service, node, x, y)} />
          </>
        );

        // UICorner / UIStroke children modify how a Frame/Button/Text renders
        let cornerRadius = 0;
        let stroke = null;
        node.children.forEach((c) => {
          if (c.type === "uicorner") cornerRadius = c.props.radius || 0;
          if (c.type === "uistroke") stroke = { color: c.props.color || "#000000", thickness: c.props.thickness || 0 };
        });

        if (node.type === "frame") {
          return (
            <div
              key={node.id}
              onMouseDown={(e) => startMove(e, service, node)}
              style={{ ...common, background: node.props.color || "#e07b28", border: stroke ? `${stroke.thickness}px solid ${stroke.color}` : "1px solid rgba(0,0,0,0.35)", borderRadius: cornerRadius }}
            >
              {handles}
            </div>
          );
        }
        if (node.type === "button") {
          const fill = darkenColor(node.props.color || "#3fa84a", pressedId === node.id ? 0.45 : 0.2);
          return (
            <div
              key={node.id}
              onMouseDown={(e) => { setPressedId(node.id); startMove(e, service, node); }}
              onMouseUp={() => setPressedId(null)}
              onMouseLeave={() => setPressedId(null)}
              style={{
                ...common,
                background: fill,
                border: stroke ? `${stroke.thickness}px solid ${stroke.color}` : "1px solid rgba(0,0,0,0.4)",
                borderRadius: cornerRadius,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 13,
                userSelect: "none",
              }}
            >
              {node.props.text ?? node.name}
              {handles}
            </div>
          );
        }
        if (node.type === "text") {
          return (
            <div
              key={node.id}
              onMouseDown={(e) => startMove(e, service, node)}
              style={{
                ...common,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: node.props.color || "#ffffff",
                fontSize: 16,
                fontWeight: 600,
                textAlign: "center",
                background: isSelected ? "rgba(255,255,255,0.06)" : "transparent",
                borderRadius: cornerRadius,
                textShadow: stroke ? "none" : "0 1px 3px rgba(0,0,0,0.6)",
                WebkitTextStroke: stroke ? `${stroke.thickness}px ${stroke.color}` : undefined,
              }}
            >
              {node.props.text || ""}
              {handles}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

function MenuItem({ label, onClick, disabled, danger }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "6px 12px",
        cursor: disabled ? "default" : "pointer",
        color: disabled ? "#666" : danger ? "#e05555" : COLORS.text,
        background: hover && !disabled ? COLORS.btnActive : "transparent",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </div>
  );
}

function ContextMenu({ menu, clipboard, onAction, onClose }) {
  if (!menu) return null;
  const { x, y, target } = menu;
  const isService = target.kind === "service";
  const isPart = target.kind === "part";
  const isExtra = target.kind === "extra";
  const win = typeof window !== "undefined" ? window : { innerWidth: 1000, innerHeight: 800 };
  const left = Math.min(x, win.innerWidth - 190);
  const top = Math.min(y, win.innerHeight - 300);
  return (
    <>
      <div onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 999 }} />
      <div style={{ position: "fixed", left, top, background: COLORS.panel, border: "1px solid " + COLORS.border, borderRadius: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.5)", zIndex: 1000, minWidth: 170, padding: "4px 0", fontSize: 12 }}>
        {!isService && <MenuItem label="Copy" onClick={() => onAction("copy")} />}
        {!isService && <MenuItem label="Cut" onClick={() => onAction("cut")} />}
        <MenuItem label="Paste" disabled={!clipboard} onClick={() => onAction("paste")} />
        {(isPart || isExtra) && <MenuItem label="Duplicate" onClick={() => onAction("duplicate")} />}
        {!isService && <MenuItem label="Rename" onClick={() => onAction("rename")} />}
        {!isService && <MenuItem label="Put in Folder" onClick={() => onAction("groupFolder")} />}
        {!isService && <MenuItem label="Put in Model" onClick={() => onAction("groupModel")} />}
        {!isService && <MenuItem label="Move to…" onClick={() => onAction("moveTo")} />}
        {!isService && <MenuItem label="Delete" danger onClick={() => onAction("delete")} />}
      </div>
    </>
  );
}

function MoveToPicker({ target, options, onPick, onCancel }) {
  if (!target) return null;
  return (
    <>
      <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 999 }} />
      <div style={{ position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)", background: COLORS.panel, border: "1px solid " + COLORS.border, borderRadius: 6, padding: 14, zIndex: 1000, width: 280, maxHeight: 360, overflowY: "auto" }}>
        <div style={{ fontWeight: 600, marginBottom: 8, color: COLORS.text }}>Move to…</div>
        {options.map((o, i) => (
          <div
            key={i}
            onClick={() => onPick(o)}
            style={{ padding: "6px 8px", cursor: "pointer", borderRadius: 3, fontSize: 12, color: COLORS.text }}
            onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.btnHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            {o.label}
          </div>
        ))}
        <button onClick={onCancel} style={{ ...typeBtnStyle, width: "100%", flexDirection: "row", marginTop: 8 }}>Cancel</button>
      </div>
    </>
  );
}

function ServiceRow({ icon, label, selected, onClick, expandable, expanded, onToggle, onAdd, onDropHere, onDragOverHere, onDragLeaveHere, isDragOver, onContextMenu }) {
  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDragOver={onDragOverHere}
      onDragLeave={onDragLeaveHere}
      onDrop={onDropHere}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        background: selected ? COLORS.btnActive : "transparent",
        cursor: "pointer",
        borderBottom: isDragOver ? "2px solid " + COLORS.accent : "2px solid transparent",
        boxSizing: "border-box",
      }}
    >
      {expandable ? (
        <span onClick={(e) => { e.stopPropagation(); onToggle(); }} style={{ display: "flex" }}>
          <Chevron open={expanded} />
        </span>
      ) : (
        <span style={{ width: 10, flexShrink: 0 }} />
      )}
      <span style={ICON_SLOT_STYLE}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {onAdd && (
        <span onClick={(e) => { e.stopPropagation(); onAdd(); }} style={{ opacity: 0.6, display: "flex" }} title="Add">
          <PlusIcon />
        </span>
      )}
    </div>
  );
}

function PartRow({ o, depth, ctx }) {
  const isDragOver = ctx.dragOverKey === o.id;
  return (
    <div
      draggable={!ctx.playMode}
      onDragStart={() => { ctx.dragPartIdRef.current = o.id; }}
      onDragEnd={() => { ctx.dragPartIdRef.current = null; ctx.setDragOverKey(null); }}
      onDragOver={(e) => { e.preventDefault(); if (ctx.dragOverKey !== o.id) ctx.setDragOverKey(o.id); }}
      onDragLeave={() => ctx.setDragOverKey((k) => (k === o.id ? null : k))}
      onDrop={(e) => {
        e.preventDefault();
        if (ctx.dragPartIdRef.current != null) {
          ctx.reorderParts(ctx.dragPartIdRef.current, o.id);
          ctx.dragPartIdRef.current = null;
        }
        ctx.setDragOverKey(null);
      }}
      onClick={() => !ctx.playMode && ctx.selectObject(o.id)}
      onDoubleClick={() => !ctx.playMode && ctx.setRenamingId(o.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!ctx.playMode) ctx.setContextMenu({ x: e.clientX, y: e.clientY, target: { kind: "part", id: o.id } });
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: `3px 10px 3px ${10 + depth * 20}px`,
        background: o.id === ctx.selectedId ? COLORS.btnActive : "transparent",
        cursor: ctx.playMode ? "default" : "grab",
        borderBottom: isDragOver ? "2px solid " + COLORS.accent : "2px solid transparent",
        boxSizing: "border-box",
      }}
    >
      <span style={{ width: 10, flexShrink: 0 }} />
      <span style={ICON_SLOT_STYLE}>
        <span style={{ width: 9, height: 9, borderRadius: 2, background: o.color, border: "1px solid rgba(255,255,255,0.3)" }} />
      </span>
      {ctx.renamingId === o.id ? (
        <input
          autoFocus
          defaultValue={o.name}
          onBlur={(e) => { ctx.setName(o.id, e.target.value || o.name); ctx.setRenamingId(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
          style={{ background: "#1c1c1c", color: COLORS.text, border: "1px solid " + COLORS.accent, fontSize: 12, width: "100%" }}
        />
      ) : (
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</span>
      )}
      <span
        onClick={(e) => { e.stopPropagation(); if (!ctx.playMode) ctx.setAddMenuTarget({ service: "Workspace", parentId: null }); }}
        style={{ opacity: 0.6, display: "flex" }}
        title="Add"
      >
        <PlusIcon />
      </span>
      <span
        onClick={(e) => { e.stopPropagation(); if (!ctx.playMode) ctx.deleteObject(o.id); }}
        style={{ opacity: 0.5, display: "flex" }}
        title="Delete"
      >
        <TrashIcon />
      </span>
    </div>
  );
}

function ExtraTree({ nodes, service, depth, ctx }) {
  return (
    <>
      {nodes.map((node) => {
        const nestedParts = (node.type === "folder" || node.type === "model") ? ctx.objects.filter((o) => o.parentExtraId === node.id) : [];
        return (
          <React.Fragment key={node.id}>
            <ExtraRow node={node} service={service} depth={depth} ctx={ctx} hasExtraChildren={nestedParts.length > 0} />
            {ctx.addMenuTarget && ctx.addMenuTarget.service === service && ctx.addMenuTarget.parentId === node.id && (
              <AddMenuRow
                depth={depth + 1}
                types={getAllowedTypes(service, node)}
                onPick={(type) => (type === "humanoidrootpart" ? ctx.insertHumanoidRootPart(node.id, service) : ctx.addExtraNode(service, node.id, type))}
                onCancel={() => ctx.setAddMenuTarget(null)}
              />
            )}
            {ctx.expandedExtra[node.id] && (
              <>
                {nestedParts.map((o) => <PartRow key={o.id} o={o} depth={depth + 1} ctx={ctx} />)}
                {node.children.length > 0 && <ExtraTree nodes={node.children} service={service} depth={depth + 1} ctx={ctx} />}
              </>
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}

function ExtraRow({ node, service, depth, ctx, hasExtraChildren }) {
  const isSelected = ctx.selectedExtra && ctx.selectedExtra.id === node.id;
  const hasChildren = node.children.length > 0 || !!hasExtraChildren;
  const NodeIcon = (TYPE_META[node.type] && TYPE_META[node.type].Icon) || GuiPartIcon;
  const isDragOver = ctx.dragOverKey === node.id;
  return (
    <div
      draggable={!ctx.playMode}
      onDragStart={(e) => { e.stopPropagation(); ctx.dragExtraRef.current = { service, id: node.id }; }}
      onDragEnd={() => { ctx.dragExtraRef.current = null; ctx.setDragOverKey(null); }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (ctx.dragOverKey !== node.id) ctx.setDragOverKey(node.id); }}
      onDragLeave={() => ctx.setDragOverKey((k) => (k === node.id ? null : k))}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (ctx.dragExtraRef.current) {
          ctx.moveExtraNode(ctx.dragExtraRef.current.service, ctx.dragExtraRef.current.id, service, node.id);
          ctx.dragExtraRef.current = null;
        } else if (ctx.dragPartIdRef.current != null && (node.type === "folder" || node.type === "model")) {
          ctx.movePartToContainer(ctx.dragPartIdRef.current, node.id);
          ctx.dragPartIdRef.current = null;
        }
        ctx.setDragOverKey(null);
      }}
      onClick={() => !ctx.playMode && ctx.selectExtra(service, node.id)}
      onDoubleClick={() => !ctx.playMode && ctx.setRenamingExtraId(node.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!ctx.playMode) ctx.setContextMenu({ x: e.clientX, y: e.clientY, target: { kind: "extra", service, id: node.id } });
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: `3px 10px 3px ${10 + depth * 20}px`,
        background: isSelected ? COLORS.btnActive : "transparent",
        cursor: ctx.playMode ? "default" : "grab",
        borderBottom: isDragOver ? "2px solid " + COLORS.accent : "2px solid transparent",
        boxSizing: "border-box",
      }}
    >
      {hasChildren ? (
        <span onClick={(e) => { e.stopPropagation(); ctx.toggleExpandedExtra(node.id); }} style={{ display: "flex" }}>
          <Chevron open={!!ctx.expandedExtra[node.id]} />
        </span>
      ) : (
        <span style={{ width: 10, flexShrink: 0 }} />
      )}
      <span style={ICON_SLOT_STYLE}><NodeIcon /></span>
      {node.props && node.props.color && (
        <span style={{ width: 8, height: 8, borderRadius: 2, background: node.props.color, flexShrink: 0, border: "1px solid rgba(255,255,255,0.3)" }} />
      )}
      {ctx.renamingExtraId === node.id ? (
        <input
          autoFocus
          defaultValue={node.name}
          onBlur={(e) => { ctx.renameExtraNode(service, node.id, e.target.value || node.name); ctx.setRenamingExtraId(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
          style={{ background: "#1c1c1c", color: COLORS.text, border: "1px solid " + COLORS.accent, fontSize: 12, width: "100%" }}
        />
      ) : (
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.name}</span>
      )}
      <span
        onClick={(e) => { e.stopPropagation(); if (!ctx.playMode) ctx.setAddMenuTarget({ service, parentId: node.id }); }}
        style={{ opacity: 0.6, display: "flex" }}
        title="Add"
      >
        <PlusIcon />
      </span>
      <span
        onClick={(e) => { e.stopPropagation(); if (!ctx.playMode) ctx.deleteExtraNode(service, node.id); }}
        style={{ opacity: 0.5, display: "flex" }}
        title="Delete"
      >
        <TrashIcon />
      </span>
    </div>
  );
}

function AddMenuRow({ depth, types, onPick, onCancel }) {
  return (
    <div style={{ padding: `6px 10px 6px ${10 + depth * 20}px`, background: "#1c1c1c" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
        {types.length === 0 && <span style={{ fontSize: 11, color: COLORS.textMuted }}>Nothing can be added here.</span>}
        {types.map((t) => {
          const { label, Icon } = TYPE_META[t];
          return (
            <button key={t} onClick={() => onPick(t)} title={label} style={typeBtnStyle}>
              <Icon size={14} />
              <span style={{ fontSize: 9, whiteSpace: "nowrap" }}>{label}</span>
            </button>
          );
        })}
        <button onClick={onCancel} title="Cancel" style={{ ...typeBtnStyle, marginLeft: "auto" }}>✕</button>
      </div>
    </div>
  );
}

const typeBtnStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 2,
  width: 48,
  background: COLORS.btn,
  border: "1px solid " + COLORS.border,
  color: COLORS.text,
  padding: "4px 2px",
  borderRadius: 3,
  cursor: "pointer",
};


const SERVICE_INFO = {
  Workspace: "Contains everything visible in your game — parts, the camera, and the baseplate.",
  StarterGui: "Only holds Gui instances — the screen UI copied to every player when they join.",
  StarterPlayer: "Where you set up the player character and test scripts. Parts kept here aren't spawned into Workspace — they're just stored, ready for testing.",
  Storage: "Stores anything — Models, Scripts, Values — kept around locally. Not visible in Workspace until something moves it there.",
};

function PropField({ label, children }) {
  return (
    <div>
      <div style={{ color: COLORS.textMuted, marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  );
}

function Vec3Field({ label, values, onChange, disabled, step, min }) {
  return (
    <PropField label={label}>
      <div style={{ display: "flex", gap: 5 }}>
        {["x", "y", "z"].map((axis) => (
          <div key={axis} style={{ flex: 1, display: "flex", alignItems: "center", background: "#1c1c1c", border: "1px solid " + COLORS.border, borderRadius: 3, overflow: "hidden" }}>
            <span style={{ padding: "0 5px", color: AXIS_COLOR[axis], fontWeight: 700, fontSize: 10 }}>{axis.toUpperCase()}</span>
            <input
              type="number"
              step={step}
              min={min}
              disabled={disabled}
              value={values[axis]}
              onChange={(e) => onChange(axis, e.target.value)}
              style={{ width: "100%", background: "transparent", border: "none", color: COLORS.text, fontSize: 11, padding: "4px 3px", outline: "none" }}
            />
          </div>
        ))}
      </div>
    </PropField>
  );
}

const inputStyle = {
  width: "100%",
  background: "#1c1c1c",
  border: "1px solid " + COLORS.border,
  borderRadius: 3,
  color: COLORS.text,
  fontSize: 12,
  padding: "5px 7px",
  boxSizing: "border-box",
};
