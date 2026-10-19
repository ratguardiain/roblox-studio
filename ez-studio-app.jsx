import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";

/* Single-file build: Studio Editor + Main Hub together (the preview runs one file, no relative imports). */

// ===================== Studio Editor =====================

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
    // Visibility (0-100): scales whatever opacity the preset gave, so Glass stays glassy
    const vis = material.userData && material.userData.visibility != null ? material.userData.visibility / 100 : 1;
    if (vis < 1) {
      material.transparent = true;
      material.opacity = material.opacity * vis;
    }
    material.needsUpdate = true;
  });
}

// ----------------------------- surface textures -----------------------------
// cached procedural canvas textures, shared (cloned per-use) and tinted via each material's
// own .color — so changing a part's color still works normally even with a texture applied.

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

// applies Default / Faces to a mesh, rebuilding its material(s) as needed
function applySurfaceTexture(mesh, textureType, colorHex, materialPresetName) {
  const prevMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const keepVisibility = prevMat && prevMat.userData && prevMat.userData.visibility != null ? prevMat.userData.visibility : 100;
  if (textureType === "faces") {
    const mats = FACE_LABELS.map((label) => {
      const m = new THREE.MeshStandardMaterial({ color: colorHex, map: getFaceTexture(label) });
      m.userData.visibility = keepVisibility;
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
  single.map = null;
  single.needsUpdate = true;
  mesh.material = single;
}

// ----------------------------- minimal zip writer / reader (store method, no deps) -----------------------------

let _crc32Table = null;
function crc32(bytes) {
  if (!_crc32Table) {
    _crc32Table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      _crc32Table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ _crc32Table[(crc ^ bytes[i]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f);
  const dateVal = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f);
  return { time, dateVal };
}

// files: [{ path, content: string }] — writes an uncompressed (store) zip, which any
// standard zip tool can open, and which our own readZip() can read back without needing DEFLATE.
function createZip(files) {
  const encoder = new TextEncoder();
  const { time, dateVal } = dosDateTime(new Date());
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.path);
    const dataBytes = encoder.encode(file.content);
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, dateVal, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    localChunks.push(local, dataBytes);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, dateVal, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralChunks.push(central);

    offset += local.length + dataBytes.length;
  });

  const centralSize = centralChunks.reduce((sum, c) => sum + c.length, 0);
  const centralOffset = offset;
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralOffset, true);

  return new Blob([...localChunks, ...centralChunks, end], { type: "application/zip" });
}

// reads back a store-method zip (what createZip produces); entries using real compression
// are skipped since there's no DEFLATE decoder here.
function readZip(arrayBuffer) {
  const data = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  let eocd = -1;
  for (let i = data.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a valid zip file");
  const entryCount = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const files = [];
  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break;
    const method = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const name = decoder.decode(data.slice(ptr + 46, ptr + 46 + nameLen));

    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    if (!name.endsWith("/")) {
      const content = method === 0 ? decoder.decode(data.slice(dataStart, dataStart + compSize)) : null;
      files.push({ path: name, content });
    }
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// parses our "Key: Value" per-line text format back into a plain object
function parseKeyValueText(text) {
  const obj = {};
  text.split("\n").forEach((line) => {
    const idx = line.indexOf(":");
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) obj[key] = value;
  });
  return obj;
}

// props <-> "Key: Value" lines (values kept on one line; multi-line text is escaped)
function propsToLines(props) {
  const lines = [];
  Object.entries(props || {}).forEach(([k, v]) => {
    if (v == null) return;
    const label = k.charAt(0).toUpperCase() + k.slice(1);
    lines.push(`${label}: ${String(v).replace(/\\/g, "\\\\").replace(/\n/g, "\\n")}`);
  });
  return lines;
}

function kvToProps(parsed) {
  const props = {};
  Object.entries(parsed).forEach(([k, rawV]) => {
    if (k === "Type" || k === "Name") return;
    const lower = k.charAt(0).toLowerCase() + k.slice(1);
    const v = rawV.replace(/\\(n|\\)/g, (m, c) => (c === "n" ? "\n" : "\\"));
    if (v === "true") props[lower] = true;
    else if (v === "false") props[lower] = false;
    else if (v !== "" && !Number.isNaN(Number(v))) props[lower] = Number(v);
    else props[lower] = v;
  });
  return props;
}

// autosave storage: localStorage when the browser allows it, plus an in-memory copy (and the
// artifact storage API when present) so nothing breaks in sandboxed previews.
const editorMemory = {};
const editorStore = {
  async get(key) {
    try {
      const v = window.localStorage.getItem(key);
      if (v != null) return v;
    } catch (e) { /* blocked */ }
    if (editorMemory[key] != null) return editorMemory[key];
    try {
      if (window.storage && window.storage.get) {
        const r = await window.storage.get(key);
        if (r && r.value != null) return r.value;
      }
    } catch (e) { /* not there */ }
    return null;
  },
  // returns true when the data is kept beyond this page session
  set(key, value) {
    editorMemory[key] = value;
    let durable = false;
    try {
      window.localStorage.setItem(key, value);
      durable = true;
    } catch (e) { /* blocked or full */ }
    try {
      if (window.storage && window.storage.set) {
        Promise.resolve(window.storage.set(key, value)).catch(() => {});
        durable = true;
      }
    } catch (e) { /* ignore */ }
    return durable;
  },
};

const SERVICE_KEYS = {
  "3d": ["Workspace", "Lighting", "StarterGui", "StarterPlayer", "Storage"],
  "2d": ["Layers", "StarterGui", "Storage"],
};

// starting contents of a brand-new 2D project: two layers and a little something on screen
function makeSeed2D() {
  const mk = (type, name, props, children = []) => ({ id: nextId(), type, name, children, props: { ...(DEFAULT_PROPS[type] || {}), ...props } });
  return [
    mk("layer", "Background", {}),
    mk("layer", "Game", {}, [
      mk("text", "Title", { text: "Hello, 2D world!", y: -60 }),
      mk("button", "StartButton", { text: "Start", y: 40 }),
    ]),
  ];
}

const CONTAINER_TYPES = ["folder", "model", "configuration", "gui"];

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

function collectContainerOptions(trees, only) {
  const out = [];
  Object.keys(trees).filter((k) => !only || only.includes(k)).forEach((service) => {
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

function ImageIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="16" rx="2" fill="#2d3b4d" stroke="#8fb7e8" strokeWidth="1.4" />
      <circle cx="9" cy="10" r="2" fill="#f2c30d" />
      <path d="M4 18l5-5 4 4 3-3 4 4" fill="none" stroke="#5cb85c" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function LayersIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinejoin="round">
      <path d="M12 3 3 8l9 5 9-5z" fill="#8fb7e8" stroke="#4a78ad" strokeWidth="1.2" />
      <path d="m3 12 9 5 9-5" stroke="#8fb7e8" strokeWidth="1.6" />
      <path d="m3 16 9 5 9-5" stroke="#5f8fc4" strokeWidth="1.6" />
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
  image: { label: "Image", Icon: ImageIcon },
  layer: { label: "Layer", Icon: LayersIcon },
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
  frame: { color: "#e07b28", width: 220, height: 160, x: 0, y: 0, rotation: 0, visibility: 100 },
  text: { color: "#ffffff", text: "Hello!", width: 220, height: 40, x: 0, y: 0, rotation: 0, visibility: 100 },
  button: { color: "#3fa84a", text: "Button", width: 160, height: 44, x: 0, y: 0, rotation: 0, visibility: 100 },
  image: { src: "", fit: "fill", width: 200, height: 200, x: 0, y: 0, rotation: 0, visibility: 100 },
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
  gui: { visibility: 100 },
  layer: { visibility: 100, locked: false },
  script: { code: "-- write your code here\n", language: "luau" },
  uicorner: { radius: 8 },
  uistroke: { color: "#000000", thickness: 2 },
  guipart: { color: "#7fd1e0" },
};

// which instance types are offered by the "+" menu, depending on where you're adding
const GENERAL_TYPES = ["folder", "model", "remoteevent", "value", "bool", "configuration", "bone", "weld", "humanoid", "script", "gui", "humanoidrootpart"];
const GUI_CONTEXT_TYPES = ["folder", "frame", "text", "button", "image"];
const GUI_ELEMENT_MODIFIERS = ["uicorner", "uistroke"];
const LIGHTING_ROOT_TYPES = ["blur", "bloom", "grayscale", "folder"];
const STARTERGUI_ROOT_TYPES = ["gui"];

const STORAGE_2D_TYPES = ["folder", "layer", "gui", "script", "value", "bool", "remoteevent", "configuration"];

function getAllowedTypes(service, parentNode, mode = "3d") {
  if (parentNode && (parentNode.type === "gui" || parentNode.type === "layer")) return GUI_CONTEXT_TYPES;
  if (parentNode && parentNode.type === "frame") return [...GUI_CONTEXT_TYPES, ...GUI_ELEMENT_MODIFIERS];
  if (parentNode && (parentNode.type === "button" || parentNode.type === "text" || parentNode.type === "image")) return GUI_ELEMENT_MODIFIERS;
  if (mode === "2d") {
    if (service === "Layers") return parentNode == null ? ["layer", "folder"] : [...GUI_CONTEXT_TYPES, "layer"];
    if (service === "StarterGui") return STARTERGUI_ROOT_TYPES;
    return STORAGE_2D_TYPES;
  }
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

function StudioEditor({ projectName, projectId, mode = "3d", onExit } = {}) {
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
  const is2D = mode === "2d";
  const [expanded, setExpanded] = useState(mode === "2d" ? { layers: true, startergui: true } : { workspace: true });
  const [tool, setTool] = useState("select");
  const [snap, setSnap] = useState({ move: 0, rotate: 0, scale: 0 }); // 0 = off, else the increment
  const [centerTab, setCenterTab] = useState("viewport"); // "viewport" | "script"
  const [openScript, setOpenScript] = useState(null); // { service, id } of the script open in the code editor tab
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [fileMenuPos, setFileMenuPos] = useState({ left: 0, top: 0 });
  const fileButtonRef = useRef(null);
  const loadInputRef = useRef(null);
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
    Layers: mode === "2d" ? makeSeed2D() : [],
  }));
  const [expandedExtra, setExpandedExtra] = useState(() => {
    const open = {};
    if (mode === "2d") (extraTrees.Layers || []).forEach((l) => { open[l.id] = true; });
    return open;
  });
  const [camera2d, setCamera2dState] = useState({ x: 0, y: 0, width: 960, height: 540, background: "#87b5e0" });
  const camera2dRef = useRef(camera2d);
  camera2dRef.current = camera2d;
  const setCamera2d = useCallback((patch) => setCamera2dState((prev) => ({ ...prev, ...patch })), []);
  const [autosaveInfo, setAutosaveInfo] = useState(null);
  const [autosaveTick, setAutosaveTick] = useState(0);
  const autosaveReadyRef = useRef(false);
  const autosaveKey = "ez-studio-project-data:" + (projectId || "default");
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
    return id;
  }, []);

  const renameExtraNode = useCallback((service, id, name) => {
    setExtraTrees((prev) => ({ ...prev, [service]: treeRename(prev[service], id, name) }));
  }, []);

  const setExtraProp = useCallback((service, id, key, value) => {
    setExtraTrees((prev) => ({ ...prev, [service]: treeMergeProps(prev[service], id, { [key]: value }) }));
  }, []);

  // upload a picture for an Image instance — stored right on the instance so it's part of the game
  const uploadGuiImage = useCallback((service, id, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result;
      const img = new Image();
      img.onload = () => {
        const maxSide = 300;
        const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        setExtraTrees((prev) => ({
          ...prev,
          [service]: treeMergeProps(prev[service], id, {
            src,
            width: Math.max(30, Math.round(img.naturalWidth * k)),
            height: Math.max(20, Math.round(img.naturalHeight * k)),
          }),
        }));
      };
      img.onerror = () => setExtraTrees((prev) => ({ ...prev, [service]: treeMergeProps(prev[service], id, { src }) }));
      img.src = src;
    };
    reader.readAsDataURL(file);
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
      showToast(target === "vscode" ? "Trying to open VS Code…" : "Trying to open Visual Studio…");
    } catch (e) {
      showToast(target === "vscode" ? "Failed to open VS Code — check if the path is valid" : "Failed to open Visual Studio — check if the path is valid");
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
        case "forward":
          if (target.kind === "extra") setExtraTrees((prev) => ({ ...prev, [target.service]: treeMoveSibling(prev[target.service], target.id, -1) }));
          break;
        case "backward":
          if (target.kind === "extra") setExtraTrees((prev) => ({ ...prev, [target.service]: treeMoveSibling(prev[target.service], target.id, 1) }));
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
    const material = new THREE.MeshStandardMaterial({ color });
    material.userData.visibility = 35; // translucent by default — adjustable with the Visibility slider
    applyMaterialPreset(material, "Plastic", color);
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
    setObjects((prev) => [...prev, { id, name: "HumanoidRootPart", type: "block", color, material: "Plastic", parentExtraId: parentId, homeService: service || "Workspace", surfaceTexture: "default", visibility: 35 }]);
    if (parentId != null) setExpandedExtra((prev) => ({ ...prev, [parentId]: true }));
    selectObject(id);
  }, [selectObject]);

  // builds a full, ready-to-animate humanoid rig: a Model containing a Humanoid,
  // a HumanoidRootPart, and the standard set of body parts — either the 15-part
  // R15 rig or the classic 6-part R6 rig.
  const createRig = useCallback(() => {
    const modelId = nextId();
    const humanoid = { id: nextId(), type: "humanoid", name: "Humanoid", children: [], props: { ...(DEFAULT_PROPS.humanoid || {}) } };
    const model = { id: modelId, type: "model", name: "R6 Rig", children: [humanoid], props: {} };
    setExtraTrees((prev) => ({ ...prev, Workspace: [...prev.Workspace, model] }));
    setExpanded((prev) => ({ ...prev, workspace: true }));
    setExpandedExtra((prev) => ({ ...prev, [modelId]: true }));

    const ox = round2((Math.random() - 0.5) * 14);
    const oz = round2((Math.random() - 0.5) * 14);
    const gray = "#a3a2a5";

    const specs = [
      { name: "Head", size: [2, 1, 1], pos: [0, 4.5, 0] },
      { name: "Torso", size: [2, 2, 1], pos: [0, 3, 0] },
      { name: "HumanoidRootPart", size: [2, 2, 1], pos: [0, 3, 0], transparent: true },
      { name: "LeftArm", size: [1, 2, 1], pos: [-1.5, 3.5, 0] },
      { name: "RightArm", size: [1, 2, 1], pos: [1.5, 3.5, 0] },
      { name: "LeftLeg", size: [1, 2, 1], pos: [-0.5, 1, 0] },
      { name: "RightLeg", size: [1, 2, 1], pos: [0.5, 1, 0] },
    ];

    const newParts = specs.map((spec) => {
      const id = nextId();
      const geometry = createGeometry("block");
      const material = new THREE.MeshStandardMaterial({ color: gray });
      material.userData.visibility = spec.transparent ? 35 : 100;
      applyMaterialPreset(material, "Plastic", gray);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = !spec.transparent;
      mesh.receiveShadow = !spec.transparent;
      mesh.scale.set(spec.size[0], spec.size[1], spec.size[2]);
      mesh.position.set(spec.pos[0] + ox, spec.pos[1], spec.pos[2] + oz);
      sceneRef.current.add(mesh);
      meshMapRef.current.set(id, mesh);
      return { id, name: spec.name, type: "block", color: gray, material: "Plastic", parentExtraId: modelId, homeService: "Workspace", surfaceTexture: "default", visibility: spec.transparent ? 35 : 100 };
    });

    setObjects((prev) => [...prev, ...newParts]);
    selectExtra("Workspace", modelId);
  }, [selectExtra]);

  // ---------------- save / load project (zip) ----------------
  const collectProjectFiles = useCallback(() => {
    const files = [];
    const usedNames = {}; // one dedupe scope per folder path

    const uniqueName = (folderPath, baseName) => {
      usedNames[folderPath] = usedNames[folderPath] || new Set();
      let name = baseName || "Unnamed";
      let n = 2;
      while (usedNames[folderPath].has(name)) {
        name = `${baseName} (${n})`;
        n++;
      }
      usedNames[folderPath].add(name);
      return name;
    };

    const writePart = (meta, folderPath) => {
      const mesh = meshMapRef.current.get(meta.id);
      if (!mesh) return;
      const name = uniqueName(folderPath, meta.name);
      const lines = [
        "Type: Part",
        `PartType: ${meta.type}`,
        `Name: ${meta.name}`,
        `Position: ${round2(mesh.position.x)}, ${round2(mesh.position.y)}, ${round2(mesh.position.z)}`,
        `Size: ${round2(mesh.scale.x)}, ${round2(mesh.scale.y)}, ${round2(mesh.scale.z)}`,
        `Rotation: ${round2(radToDeg(mesh.rotation.x))}, ${round2(radToDeg(mesh.rotation.y))}, ${round2(radToDeg(mesh.rotation.z))}`,
        `Color: ${meta.color}`,
        `Material: ${meta.material}`,
        `SurfaceTexture: ${meta.surfaceTexture || "default"}`,
        `Visibility: ${meta.visibility ?? 100}`,
      ];
      files.push({ path: `${folderPath}/${name}.txt`, content: lines.join("\n") + "\n" });
    };

    const writeNode = (node, folderPath) => {
      if (CONTAINER_TYPES.includes(node.type)) {
        const dirName = uniqueName(folderPath, node.name);
        const newPath = `${folderPath}/${dirName}`;
        files.push({ path: `${newPath}/_info.txt`, content: [`Type: ${node.type}`, `Name: ${node.name}`, ...propsToLines(node.props)].join("\n") + "\n" });
        objectsRef.current.filter((o) => o.parentExtraId === node.id).forEach((meta) => writePart(meta, newPath));
        node.children.forEach((child) => writeNode(child, newPath));
      } else {
        // scripts save their code/language; bools/values save their state; everything else
        // saves whatever is in its props — position/size/rotation don't apply to these.
        const name = uniqueName(folderPath, node.name);
        const lines = [`Type: ${node.type}`, `Name: ${node.name}`];
        lines.push(...propsToLines(node.props));
        files.push({ path: `${folderPath}/${name}.txt`, content: lines.join("\n") + "\n" });
        node.children.forEach((child) => writeNode(child, folderPath));
      }
    };

    files.push({ path: "Project.txt", content: `Mode: ${mode}\n` });
    if (mode === "2d") {
      const c = camera2dRef.current;
      files.push({ path: "Camera.txt", content: `X: ${c.x}\nY: ${c.y}\nWidth: ${c.width}\nHeight: ${c.height}\nBackground: ${c.background}\n` });
    }
    SERVICE_KEYS[mode].forEach((service) => {
      objectsRef.current
        .filter((o) => o.parentExtraId == null && (service === "Workspace"))
        .forEach((meta) => writePart(meta, service));
      (extraTreesRef.current[service] || []).forEach((node) => writeNode(node, service));
    });

    return files;
  }, []);

  const saveProject = useCallback(() => {
    downloadBlob(createZip(collectProjectFiles()), "studio-project.zip");
    showToast("💾 Project saved");
  }, [showToast, collectProjectFiles]);

  // rebuilds the whole project from [{ path, content }] entries (used by Load Project and autosave restore)
  const applyProjectEntries = useCallback((entries, lightingSaved) => {
    // make sure this save belongs to this kind of editor, and pick up the 2D camera if there is one
    let fileMode = "3d";
    let cameraSaved = null;
    entries.forEach((entry) => {
      if (entry.content == null) return;
      if (entry.path === "Project.txt") fileMode = (parseKeyValueText(entry.content).Mode || "3d").toLowerCase();
      if (entry.path === "Camera.txt") cameraSaved = parseKeyValueText(entry.content);
    });
    if (fileMode !== mode) {
      showToast(`That project was saved from the ${fileMode.toUpperCase()} editor`);
      return false;
    }

    // wipe everything currently in the 3D scene — the saved project is the source of truth
    meshMapRef.current.forEach((mesh) => {
      if (sceneRef.current) sceneRef.current.remove(mesh);
      mesh.geometry.dispose();
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m.dispose());
    });
    meshMapRef.current.clear();

    const newExtraTrees = {};
    SERVICE_KEYS[mode].forEach((k) => { newExtraTrees[k] = []; });
    const newParts = [];

    // group entries by top-level service, then by folder path within that service
    const byService = {};
    entries.forEach((entry) => {
      if (entry.content == null) return; // unsupported (compressed) entry, skip
      const segments = entry.path.split("/").filter(Boolean);
      if (segments.length < 2) return;
      const service = segments[0];
      if (!newExtraTrees[service]) return;
      byService[service] = byService[service] || [];
      byService[service].push({ segments: segments.slice(1), content: entry.content });
    });

    Object.keys(newExtraTrees).forEach((service) => {
      const entriesForService = byService[service] || [];
      // directory node cache, keyed by joined path within this service ("" = root)
      const dirNodes = { "": { children: newExtraTrees[service] } };

      const ensureDir = (pathSegs) => {
        const key = pathSegs.join("/");
        if (dirNodes[key]) return dirNodes[key];
        const parentKey = pathSegs.slice(0, -1).join("/");
        const parent = ensureDir(pathSegs.slice(0, -1));
        const infoEntry = entriesForService.find((e) => e.segments.join("/") === pathSegs.join("/") + "/_info.txt");
        const info = infoEntry ? parseKeyValueText(infoEntry.content) : {};
        const node = {
          id: nextId(),
          type: info.Type || "folder",
          name: info.Name || pathSegs[pathSegs.length - 1],
          children: [],
          props: kvToProps(info),
        };
        parent.children.push(node);
        dirNodes[key] = node;
        return node;
      };

      entriesForService.forEach((entry) => {
        const fname = entry.segments[entry.segments.length - 1];
        if (fname === "_info.txt") {
          ensureDir(entry.segments.slice(0, -1));
          return;
        }
        if (!fname.endsWith(".txt")) return;
        const dirSegs = entry.segments.slice(0, -1);
        const dir = ensureDir(dirSegs);
        const parsed = parseKeyValueText(entry.content);

        if (parsed.Type === "Part") {
          const [px, py, pz] = (parsed.Position || "0,0,0").split(",").map((n) => parseFloat(n) || 0);
          const [sx, sy, sz] = (parsed.Size || "1,1,1").split(",").map((n) => parseFloat(n) || 1);
          const [rx, ry, rz] = (parsed.Rotation || "0,0,0").split(",").map((n) => parseFloat(n) || 0);
          const color = parsed.Color || COLORS.defaultPartColor;
          const partType = parsed.PartType || "block";
          const id = nextId();
          const geometry = createGeometry(partType);
          const material = new THREE.MeshStandardMaterial({ color });
          const loadedVisibility = parsed.Visibility != null && !Number.isNaN(parseFloat(parsed.Visibility)) ? parseFloat(parsed.Visibility) : 100;
          material.userData.visibility = loadedVisibility;
          const mesh = new THREE.Mesh(geometry, material);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.scale.set(sx, sy, sz);
          mesh.position.set(px, py, pz);
          mesh.rotation.set(degToRad(rx), degToRad(ry), degToRad(rz));
          applySurfaceTexture(mesh, parsed.SurfaceTexture || "default", color, parsed.Material || "Plastic");
          sceneRef.current.add(mesh);
          meshMapRef.current.set(id, mesh);
          newParts.push({
            id,
            name: parsed.Name || "Part",
            type: partType,
            color,
            material: parsed.Material || "Plastic",
            parentExtraId: dirSegs.length === 0 ? null : dir.id,
            homeService: service,
            surfaceTexture: parsed.SurfaceTexture || "default",
            visibility: loadedVisibility,
          });
        } else {
          const type = parsed.Type || "folder";
          const props = {};
          Object.entries(parsed).forEach(([k, rawV]) => {
            let v = rawV;
            if (k === "Type" || k === "Name") return;
            const lower = k.charAt(0).toLowerCase() + k.slice(1);
            v = v.replace(/\\(n|\\)/g, (m, c) => (c === "n" ? "\n" : "\\"));
            if (v === "true") props[lower] = true;
            else if (v === "false") props[lower] = false;
            else if (v !== "" && !Number.isNaN(Number(v))) props[lower] = Number(v);
            else props[lower] = v;
          });
          dir.children.push({ id: nextId(), type, name: parsed.Name || fname.replace(/\.txt$/, ""), children: [], props });
        }
      });
    });

    setExtraTrees({ Workspace: [], Lighting: [], StarterGui: [], StarterPlayer: [], Storage: [], Layers: [], ...newExtraTrees });
    setObjects(newParts);
    setExpanded(mode === "2d" ? { layers: true, startergui: true } : { workspace: true });
    const openAll = {};
    if (mode === "2d") (newExtraTrees.Layers || []).forEach((l) => { openAll[l.id] = true; });
    setExpandedExtra(openAll);
    if (cameraSaved) {
      setCamera2d({
        x: Number(cameraSaved.X) || 0,
        y: Number(cameraSaved.Y) || 0,
        width: Number(cameraSaved.Width) || 960,
        height: Number(cameraSaved.Height) || 540,
        background: cameraSaved.Background || "#87b5e0",
      });
    }
    setSelectedExtra(null);
    setSelectedService(null);
    selectObject(null);
    if (lightingSaved && sunRef.current && hemiRef.current) {
      sunRef.current.intensity = lightingSaved.brightness;
      hemiRef.current.intensity = lightingSaved.ambient;
      sunRef.current.color.set(lightingSaved.color);
      setLighting({ brightness: round2(lightingSaved.brightness), ambient: round2(lightingSaved.ambient), color: lightingSaved.color });
    }
    return true;
  }, [selectObject, showToast, setCamera2d]);

  const loadProjectFile = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      let entries;
      try {
        entries = readZip(reader.result);
      } catch (e) {
        showToast("Failed to read the file");
        return;
      }
      if (applyProjectEntries(entries)) showToast("📂 Project loaded");
    };
    reader.readAsArrayBuffer(file);
  }, [showToast, applyProjectEntries]);

  // ---------------- property field updates ----------------
  const setField = useCallback((category, axis, value) => {
    const id = selectedIdRef.current;
    if (id == null) return;
    const mesh = meshMapRef.current.get(id);
    if (!mesh) return;
    const v = parseFloat(value);
    if (Number.isNaN(v)) return;
    if (category === "position") mesh.position[axis] = v;
    else if (category === "size") mesh.scale[axis] = Math.max(0.05, v);
    else if (category === "rotationDeg") mesh.rotation[axis] = degToRad(v);
    setTransform(readTransform(mesh));
  }, [readTransform]);

  // Visibility 0-100 for a part: 100 = fully visible, 0 = invisible
  const setVisibility = useCallback((id, value) => {
    const mesh = meshMapRef.current.get(id);
    const v = Math.max(0, Math.min(100, Number(value)));
    setObjects((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        if (mesh) {
          (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => { m.userData.visibility = v; });
          applyMaterialPreset(mesh.material, o.material, o.color);
          mesh.castShadow = v > 5;
        }
        return { ...o, visibility: v };
      })
    );
  }, []);

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
    if (mode === "2d") return undefined; // the 2D editor has no 3D scene
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

    // baseplate — a normal, editable part
    {
      const id = nextId();
      const geometry = createGeometry("block");
      const baseColor = "#787878"; // rgb(120,120,120)
      const material = new THREE.MeshStandardMaterial({ color: baseColor });
      applyMaterialPreset(material, "Plastic", baseColor);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = true;
      mesh.scale.set(220, 4, 220);
      mesh.position.set(0, -2, 0);
      scene.add(mesh);
      meshMapRef.current.set(id, mesh);
      setObjects((prev) => [...prev, { id, name: "Baseplate", type: "block", color: baseColor, material: "Plastic", parentExtraId: null, homeService: "Workspace", surfaceTexture: "default" }]);
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
        // true fly camera: forward/back follow exactly where you're looking (including up/down
        // tilt), not just the flat horizontal direction
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
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
          return { id: newId, name: meta.name, type: meta.type, color: meta.color, material: meta.material, parentExtraId: newModelId, surfaceTexture: meta.surfaceTexture || "default", visibility: meta.visibility ?? 100 };
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

  // ---------------- 2D editor helpers ----------------
  // adds a Layer, or an element into the layer you're working in (making a layer if there isn't one yet)
  const insert2D = (type) => {
    const layers = extraTrees.Layers || [];
    let parentId = null;
    if (type !== "layer") {
      if (selectedExtra && selectedExtra.service === "Layers") {
        const findLayer = (nodes, id, current) => {
          for (const n of nodes) {
            const layer = n.type === "layer" ? n : current;
            if (n.id === id) return layer;
            const found = findLayer(n.children, id, layer);
            if (found) return found;
          }
          return null;
        };
        const owner = findLayer(layers, selectedExtra.id, null);
        if (owner) parentId = owner.id;
      }
      if (parentId == null) {
        const firstLayer = layers.find((n) => n.type === "layer");
        parentId = firstLayer ? firstLayer.id : addExtraNode("Layers", null, "layer");
      }
    }
    const id = addExtraNode("Layers", parentId, type);
    if (type !== "layer") {
      // drop new elements in the middle of what the camera currently sees
      setExtraProp("Layers", id, "x", camera2dRef.current.x);
      setExtraProp("Layers", id, "y", camera2dRef.current.y);
    }
    selectExtra("Layers", id);
  };

  // Delete / Esc in the 2D editor (the 3D editor has its own key handling)
  useEffect(() => {
    if (!is2D) return undefined;
    const onKey = (e) => {
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedExtra && !playMode) deleteExtraNode(selectedExtra.service, selectedExtra.id);
      if (e.key === "Escape") { setSelectedExtra(null); setSelectedService(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [is2D, selectedExtra, playMode, deleteExtraNode]);

  // ---------------- autosave ----------------
  const autosaveNow = useCallback(() => {
    if (!autosaveReadyRef.current || playModeRef.current) return;
    try {
      const files = collectProjectFiles();
      const lightingNow =
        sunRef.current && hemiRef.current
          ? { brightness: sunRef.current.intensity, ambient: hemiRef.current.intensity, color: "#" + sunRef.current.color.getHexString() }
          : null;
      const durable = editorStore.set(autosaveKey, JSON.stringify({ v: 1, savedAt: Date.now(), files, lighting: lightingNow }));
      setAutosaveInfo({ time: Date.now(), durable });
    } catch (e) {
      setAutosaveInfo({ failed: true });
    }
  }, [collectProjectFiles, autosaveKey]);

  // bring back what was autosaved last time this project was open
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const raw = await editorStore.get(autosaveKey);
      if (cancelled) return;
      if (raw) {
        try {
          const data = JSON.parse(raw);
          if (data && Array.isArray(data.files)) {
            applyProjectEntries(data.files, data.lighting);
            showToast("☁ Restored your autosaved project");
          }
        } catch (e) { /* unreadable autosave — start fresh */ }
      }
      autosaveReadyRef.current = true;
      setAutosaveTick((t) => t + 1);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // save a moment after anything changes (not while testing, since Play adds temporary objects)
  useEffect(() => {
    if (!autosaveReadyRef.current || playMode) return undefined;
    const t = setTimeout(autosaveNow, 700);
    return () => clearTimeout(t);
  }, [objects, extraTrees, transform, lighting, camera2d, playMode, autosaveTick, autosaveNow]);

  // and once more when leaving the project or closing the page
  useEffect(() => {
    window.addEventListener("beforeunload", autosaveNow);
    window.addEventListener("pagehide", autosaveNow);
    return () => {
      window.removeEventListener("beforeunload", autosaveNow);
      window.removeEventListener("pagehide", autosaveNow);
      autosaveNow();
    };
  }, [autosaveNow]);

  const selectedMeta = objects.find((o) => o.id === selectedId);
  const viewportFilter = collectLightingEffects(extraTrees);
  const guiElements = collectGuiElements(extraTrees, mode);
  const workspacePartCount = objects.filter((o) => (o.parentExtraId == null ? true : findServiceOfExtraId(extraTrees, o.parentExtraId) === "Workspace")).length;

  const SERVICES = is2D
    ? [
        { key: "Layers", icon: <LayersIcon /> },
        { key: "StarterGui", icon: <FolderIcon badge="square" /> },
        { key: "Storage", icon: <FolderIcon badge="circle" /> },
      ]
    : [
        { key: "Workspace", icon: <GlobeIcon /> },
        { key: "Lighting", icon: <SunIcon /> },
        { key: "StarterGui", icon: <FolderIcon badge="square" /> },
        { key: "StarterPlayer", icon: <FolderIcon badge="person" /> },
        { key: "Storage", icon: <FolderIcon badge="circle" /> },
      ];

  const extraCtx = {
    mode,
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
        {onExit && (
          <span onClick={onExit} title="Back to the Main Hub" style={{ cursor: "pointer", color: COLORS.textMuted, fontSize: 12 }}>
            ◀ Hub
          </span>
        )}
        <div style={{ fontWeight: 600, fontSize: 12.5 }}>{projectName || "studio project"}</div>
        <div style={{ display: "flex", gap: 14, color: COLORS.textMuted, marginLeft: 8 }}>
          <span
            ref={fileButtonRef}
            onClick={() => {
              if (!fileMenuOpen && fileButtonRef.current) {
                const rect = fileButtonRef.current.getBoundingClientRect();
                setFileMenuPos({ left: rect.left, top: rect.bottom + 4 });
              }
              setFileMenuOpen((o) => !o);
            }}
            title="Save/Load this project, Plugins, Import, Export"
            style={{ cursor: "pointer", color: fileMenuOpen ? COLORS.text : COLORS.textMuted }}
          >
            File
          </span>
          <span title="Studio-wide settings — rendering (OpenGL/Vulkan), lighting technology, performance">Studio</span>
        </div>
      </div>

      {/* ribbon */}
      <div style={{ display: "flex", alignItems: "center", height: 46, background: COLORS.ribbon, borderBottom: "1px solid " + COLORS.border, padding: "0 8px", gap: 2, flexShrink: 0, overflowX: "auto" }}>
        {is2D ? (
          <>
            <ToolButton title="Add a Layer — layers stack, top of the list is in front" onClick={() => insert2D("layer")}>▤ Layer</ToolButton>
            <Divider />
            <ToolButton title="Add a Frame to the selected layer" onClick={() => insert2D("frame")}>▢ Frame</ToolButton>
            <ToolButton title="Add Text to the selected layer" onClick={() => insert2D("text")}>T Text</ToolButton>
            <ToolButton title="Add a Button to the selected layer" onClick={() => insert2D("button")}>⬚ Button</ToolButton>
            <ToolButton title="Add an Image to the selected layer" onClick={() => insert2D("image")}>🖼 Image</ToolButton>
          </>
        ) : (
          <>
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
        <ToolButton title="Build an R6 humanoid rig — Model + Humanoid + HumanoidRootPart + body parts" onClick={createRig}>🦴 R6 Builder</ToolButton>
        <Divider />
        <SnapButton label="Move" unit="stud" options={[0, 1, 0.5]} value={snap.move} onChange={(v) => setSnap((s) => ({ ...s, move: v }))} />
        <SnapButton label="Rotate" unit="°" options={[0, 15, 45, 90]} value={snap.rotate} onChange={(v) => setSnap((s) => ({ ...s, rotate: v }))} />
        <SnapButton label="Scale" unit="stud" options={[0, 1, 0.5, 0.25]} value={snap.scale} onChange={(v) => setSnap((s) => ({ ...s, scale: v }))} />
          </>
        )}
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
            {is2D && (
              <ServiceRow
                icon={<span>📷</span>}
                label="Camera"
                selected={selectedService === "Camera"}
                onClick={() => !playMode && selectService("Camera")}
                onContextMenu={(e) => e.preventDefault()}
              />
            )}
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
                    types={getAllowedTypes(svc.key, null, mode)}
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
            {is2D ? (
              <Canvas2D
                elements={guiElements}
                camera={camera2d}
                setCamera={setCamera2d}
                cameraSelected={selectedService === "Camera"}
                onSelectCamera={() => selectService("Camera")}
                onDeselect={() => { setSelectedExtra(null); setSelectedService(null); }}
                selectedExtra={selectedExtra}
                selectExtra={selectExtra}
                setExtraProp={setExtraProp}
                playMode={playMode}
              />
            ) : (
              <>
                <div ref={mountRef} style={{ position: "absolute", inset: 0, filter: viewportFilter }} />
                <ScreenGuiOverlay elements={guiElements} selectedExtra={selectedExtra} selectExtra={selectExtra} setExtraProp={setExtraProp} playMode={playMode} />
                <div style={{ position: "absolute", left: 10, bottom: 10, color: "rgba(255,255,255,0.75)", fontSize: 11, background: "rgba(0,0,0,0.35)", padding: "5px 9px", borderRadius: 4, lineHeight: 1.5 }}>
                  Left-click: select / drag &nbsp;•&nbsp; Right-drag: orbit &nbsp;•&nbsp; Middle-drag: pan &nbsp;•&nbsp; Scroll: zoom &nbsp;•&nbsp; WASD/QE: fly camera
                </div>
              </>
            )}
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
          ) : selectedService === "Camera" && is2D ? (
            <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ color: COLORS.textMuted, lineHeight: 1.5, marginBottom: 2 }}>
                The camera decides what the player sees. Drag its 📷 tab on the canvas to move it — Play shows only what's inside its frame. Gui in StarterGui stays pinned to it.
              </div>
              {[["x", "Position X"], ["y", "Position Y"], ["width", "View Width"], ["height", "View Height"]].map(([key, label]) => (
                <PropField key={key} label={label}>
                  <input
                    type="number"
                    disabled={playMode}
                    value={camera2d[key]}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (Number.isNaN(v)) return;
                      setCamera2d({ [key]: key === "width" ? Math.max(160, v) : key === "height" ? Math.max(90, v) : v });
                    }}
                    style={inputStyle}
                  />
                </PropField>
              ))}
              <PropField label="Background Color">
                <input
                  type="color"
                  disabled={playMode}
                  value={camera2d.background}
                  onChange={(e) => setCamera2d({ background: e.target.value })}
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

                  {node.type === "layer" && (
                    <>
                      <div style={{ color: COLORS.textMuted, lineHeight: 1.5 }}>A layer of your 2D world. Layers higher in the list draw in front of the ones below.</div>
                      <PropField label="Locked">
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: playMode ? "default" : "pointer" }}>
                          <input type="checkbox" disabled={playMode} checked={!!props.locked} onChange={(e) => setExtraProp(svc, node.id, "locked", e.target.checked)} />
                          Can't be selected or dragged on the canvas
                        </label>
                      </PropField>
                    </>
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

                  {node.type === "image" && (
                    <>
                      <PropField label="Image">
                        <label style={{ ...typeBtnStyle, flexDirection: "row", width: "100%", boxSizing: "border-box", cursor: playMode ? "default" : "pointer" }}>
                          📁 {props.src ? "Replace Image…" : "Upload Image…"}
                          <input
                            type="file"
                            accept="image/*"
                            disabled={playMode}
                            style={{ display: "none" }}
                            onChange={(e) => { uploadGuiImage(svc, node.id, e.target.files && e.target.files[0]); e.target.value = ""; }}
                          />
                        </label>
                      </PropField>
                      <PropField label="Scale Type">
                        <select disabled={playMode} value={props.fit || "fill"} onChange={(e) => setExtraProp(svc, node.id, "fit", e.target.value)} style={inputStyle}>
                          <option value="fill">Stretch</option>
                          <option value="contain">Fit</option>
                          <option value="cover">Crop</option>
                        </select>
                      </PropField>
                      {!props.src && <div style={{ color: COLORS.textMuted, fontSize: 11, lineHeight: 1.4 }}>Upload a PNG, JPG, GIF or WebP and it shows up on screen right away.</div>}
                    </>
                  )}

                  {["frame", "text", "button", "image", "gui", "layer"].includes(node.type) && (
                    <PropField label={`Visibility (${props.visibility ?? 100}%)`}>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        disabled={playMode}
                        value={props.visibility ?? 100}
                        onChange={(e) => setExtraProp(svc, node.id, "visibility", parseFloat(e.target.value))}
                        style={{ width: "100%" }}
                      />
                    </PropField>
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
                  <option value="faces">Faces</option>
                </select>
              </PropField>

              <PropField label={`Visibility (${selectedMeta.visibility ?? 100}%)`}>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  disabled={playMode}
                  value={selectedMeta.visibility ?? 100}
                  onChange={(e) => setVisibility(selectedMeta.id, e.target.value)}
                  style={{ width: "100%" }}
                />
              </PropField>
            </div>
          )}
        </div>
      </div>

      {/* status bar */}
      <div style={{ height: 22, background: COLORS.statusBar, display: "flex", alignItems: "center", padding: "0 10px", fontSize: 11, flexShrink: 0, gap: 16 }}>
        <span>{selectedMeta ? `Selected: ${selectedMeta.name}` : selectedService ? `Selected: ${selectedService}` : selectedExtra ? "Selected: item" : "No selection"}</span>
        {!is2D && <span>Tool: {tool}</span>}
        <span style={{ opacity: 0.9 }}>
          {autosaveInfo
            ? autosaveInfo.failed
              ? "⚠ Autosave failed"
              : `☁ Autosaved ${new Date(autosaveInfo.time).toLocaleTimeString()}${autosaveInfo.durable ? "" : " (this session)"}`
            : "☁ Autosave on"}
        </span>
        <span style={{ marginLeft: "auto" }}>
          {is2D
            ? `${guiElements.length} element${guiElements.length === 1 ? "" : "s"} · 2D`
            : `${workspacePartCount} part${workspacePartCount === 1 ? "" : "s"} in Workspace`}
        </span>
      </div>

      <ContextMenu menu={contextMenu} clipboard={clipboard} onAction={handleContextAction} onClose={closeContextMenu} mode2d={is2D} />
      <MoveToPicker target={moveToTarget} options={collectContainerOptions(extraTrees, SERVICES.map((sv) => sv.key))} onPick={performMoveTo} onCancel={() => setMoveToTarget(null)} />
      {fileMenuOpen && (
        <>
          <div onClick={() => setFileMenuOpen(false)} onContextMenu={(e) => { e.preventDefault(); setFileMenuOpen(false); }} style={{ position: "fixed", inset: 0, zIndex: 99998 }} />
          <div style={{ position: "fixed", left: fileMenuPos.left, top: fileMenuPos.top, background: COLORS.panel, border: "1px solid " + COLORS.border, borderRadius: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.6)", zIndex: 99999, minWidth: 190, padding: "4px 0" }}>
            <MenuItem label="💾 Save Project" onClick={() => { saveProject(); setFileMenuOpen(false); }} />
            <MenuItem label="📂 Load Project…" onClick={() => { setFileMenuOpen(false); loadInputRef.current && loadInputRef.current.click(); }} />
            <div style={{ height: 1, background: COLORS.border, margin: "4px 0" }} />
            <MenuItem label="Plugins" onClick={() => { showToast("Plugins browser isn't available in this preview"); setFileMenuOpen(false); }} />
            <MenuItem label="Import (OBJ / FBX)" onClick={() => { showToast("Import isn't available in this preview"); setFileMenuOpen(false); }} />
            <MenuItem label="Export (OBJ / FBX)" onClick={() => { showToast("Export isn't available in this preview"); setFileMenuOpen(false); }} />
          </div>
        </>
      )}
      <input
        ref={loadInputRef}
        type="file"
        accept=".zip"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files && e.target.files[0];
          if (file) loadProjectFile(file);
          e.target.value = "";
        }}
      />
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

const GUI_ELEMENT_TYPES = ["frame", "button", "text", "image"];

// flat list of on-screen elements. A Gui / Layer's Visibility carries down to everything inside it.
// In 2D mode each element also gets a stacking order (top of the Layers list = frontmost), Layers
// elements live in the world, and StarterGui elements are HUD pinned to the camera view.
function collectGuiElements(trees, mode = "3d") {
  const out = [];
  let order = 0;
  const walk = (service, nodes, inherited, locked) => {
    nodes.forEach((n) => {
      const lockedHere = locked || (n.type === "layer" && !!n.props.locked);
      if (GUI_ELEMENT_TYPES.includes(n.type)) {
        const is2d = mode === "2d";
        out.push({
          service,
          node: n,
          inherited,
          locked: lockedHere,
          hud: is2d && service === "StarterGui",
          z: is2d ? (service === "StarterGui" ? 100000 : 50000) - order : undefined,
        });
        order++;
      }
      const next = n.type === "gui" || n.type === "layer" ? inherited * ((n.props.visibility ?? 100) / 100) : inherited;
      walk(service, n.children, next, lockedHere);
    });
  };
  const services = mode === "2d" ? ["Layers", "StarterGui"] : Object.keys(trees);
  services.forEach((service) => walk(service, trees[service] || [], 1, false));
  return out;
}

// moves a node one step earlier/later among its siblings (used for Layer / element ordering)
function treeMoveSibling(nodes, id, dir) {
  const idx = nodes.findIndex((n) => n.id === id);
  if (idx >= 0) {
    const to = idx + dir;
    if (to < 0 || to >= nodes.length) return nodes;
    const arr = [...nodes];
    [arr[idx], arr[to]] = [arr[to], arr[idx]];
    return arr;
  }
  return nodes.map((n) => ({ ...n, children: treeMoveSibling(n.children, id, dir) }));
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

function ScreenGuiOverlay({ elements, selectedExtra, selectExtra, setExtraProp, playMode, scale = 1, hudOffset }) {
  const overlayRef = useRef(null);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const hudOff = hudOffset || { x: 0, y: 0 };
  const resizeRef = useRef(null);
  const moveRef = useRef(null);
  const rotateRef = useRef(null);
  const [pressedId, setPressedId] = useState(null);

  useEffect(() => {
    const onMove = (e) => {
      const rz = resizeRef.current;
      if (rz) {
        const dx = (e.clientX - rz.startX) / scaleRef.current;
        const dy = (e.clientY - rz.startY) / scaleRef.current;
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
        const dx = (e.clientX - mv.startClientX) / scaleRef.current;
        const dy = (e.clientY - mv.startClientY) / scaleRef.current;
        if (Math.abs(dx) + Math.abs(dy) > 4 / scaleRef.current) mv.moved = true;
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
    // the element's own box (a rotated box keeps the same center), so this works under any zoom/pan
    const box = e.currentTarget.parentElement.getBoundingClientRect();
    rotateRef.current = {
      service,
      id: node.id,
      centerX: box.left + box.width / 2,
      centerY: box.top + box.height / 2,
    };
  };

  return (
    <div ref={overlayRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {elements.map(({ service, node, inherited, z, hud, locked }) => {
        const isSelected = selectedExtra && selectedExtra.id === node.id;
        const w = node.props.width || 200;
        const h = node.props.height || (node.type === "text" ? 40 : node.type === "button" ? 44 : 150);
        const x = node.props.x || 0;
        const y = node.props.y || 0;
        const rotation = node.props.rotation || 0;
        const opacity = Math.max(0, Math.min(1, (inherited ?? 1) * ((node.props.visibility ?? 100) / 100)));
        const common = {
          position: "absolute",
          left: `calc(50% + ${x + (hud ? hudOff.x : 0)}px)`,
          top: `calc(50% + ${y + (hud ? hudOff.y : 0)}px)`,
          transform: `translate(-50%,-50%) rotate(${rotation}deg)`,
          width: w,
          height: h,
          boxSizing: "border-box",
          pointerEvents: playMode || locked ? "none" : "auto",
          outline: isSelected ? "2px solid " + COLORS.accent : "none",
          outlineOffset: 2,
          cursor: playMode ? "default" : "move",
          zIndex: z,
        };
        // handles live on the outer wrapper so they stay fully visible even at 0% Visibility
        const handles = isSelected && !playMode && !locked && (
          <>
            <ResizeHandle onStart={(e) => startResize(e, service, node, w, h)} />
            <RotateHandle onStart={(e) => startRotate(e, service, node, x, y)} />
          </>
        );

        // UICorner / UIStroke children modify how a Frame/Button/Text/Image renders
        let cornerRadius = 0;
        let stroke = null;
        node.children.forEach((c) => {
          if (c.type === "uicorner") cornerRadius = c.props.radius || 0;
          if (c.type === "uistroke") stroke = { color: c.props.color || "#000000", thickness: c.props.thickness || 0 };
        });
        const fillStyle = { position: "absolute", inset: 0, boxSizing: "border-box", opacity, borderRadius: cornerRadius };

        if (node.type === "frame") {
          return (
            <div key={node.id} onMouseDown={(e) => startMove(e, service, node)} style={common}>
              <div style={{ ...fillStyle, background: node.props.color || "#e07b28", border: stroke ? `${stroke.thickness}px solid ${stroke.color}` : "1px solid rgba(0,0,0,0.35)" }} />
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
              style={common}
            >
              <div
                style={{
                  ...fillStyle,
                  background: fill,
                  border: stroke ? `${stroke.thickness}px solid ${stroke.color}` : "1px solid rgba(0,0,0,0.4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: 13,
                  userSelect: "none",
                }}
              >
                {node.props.text ?? node.name}
              </div>
              {handles}
            </div>
          );
        }
        if (node.type === "text") {
          return (
            <div key={node.id} onMouseDown={(e) => startMove(e, service, node)} style={common}>
              <div
                style={{
                  ...fillStyle,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: node.props.color || "#ffffff",
                  fontSize: 16,
                  fontWeight: 600,
                  textAlign: "center",
                  background: isSelected ? "rgba(255,255,255,0.06)" : "transparent",
                  textShadow: stroke ? "none" : "0 1px 3px rgba(0,0,0,0.6)",
                  WebkitTextStroke: stroke ? `${stroke.thickness}px ${stroke.color}` : undefined,
                }}
              >
                {node.props.text || ""}
              </div>
              {handles}
            </div>
          );
        }
        if (node.type === "image") {
          return (
            <div key={node.id} onMouseDown={(e) => startMove(e, service, node)} style={common}>
              <div
                style={{
                  ...fillStyle,
                  overflow: "hidden",
                  border: stroke ? `${stroke.thickness}px solid ${stroke.color}` : node.props.src ? "none" : "1px dashed rgba(255,255,255,0.5)",
                  background: node.props.src ? "transparent" : "rgba(0,0,0,0.25)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "rgba(255,255,255,0.7)",
                  fontSize: 12,
                }}
              >
                {node.props.src ? (
                  <img
                    src={node.props.src}
                    alt={node.name}
                    draggable={false}
                    style={{ width: "100%", height: "100%", objectFit: node.props.fit || "fill", display: "block", pointerEvents: "none", userSelect: "none" }}
                  />
                ) : (
                  "No image — upload one in Properties"
                )}
              </div>
              {handles}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

// ----------------------------- 2D editor canvas -----------------------------
// A pannable / zoomable 2D world. Layers elements live in the world; StarterGui (HUD) elements are
// pinned to the Camera. The Camera is a draggable, resizable frame — Play shows only what it sees.
function Canvas2D({ elements, camera, setCamera, cameraSelected, onSelectCamera, onDeselect, selectedExtra, selectExtra, setExtraProp, playMode }) {
  const rootRef = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const cameraRef2 = useRef(camera);
  cameraRef2.current = camera;
  const setCameraRef = useRef(setCamera);
  setCameraRef.current = setCamera;
  const deselectRef = useRef(onDeselect);
  deselectRef.current = onDeselect;
  const dragRef = useRef(null);

  // keep track of the canvas size
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const measure = () => setSize({ w: el.clientWidth || 800, h: el.clientHeight || 500 });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // start with the camera centered in view
  useEffect(() => {
    setView({ x: -cameraRef2.current.x, y: -cameraRef2.current.y, zoom: 1 });
  }, []);

  // scroll wheel zooms toward the cursor (native listener so the page doesn't scroll)
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (playMode) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const cx = e.clientX - (r.left + r.width / 2);
      const cy = e.clientY - (r.top + r.height / 2);
      const v = viewRef.current;
      const z2 = Math.max(0.15, Math.min(4, v.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
      const k = z2 / v.zoom;
      setView({ x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k, zoom: z2 });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [playMode]);

  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      const z = viewRef.current.zoom;
      if (d.type === "pan") {
        setView({ x: d.vx + dx, y: d.vy + dy, zoom: z });
      } else if (d.type === "cam") {
        setCameraRef.current({ x: Math.round(d.cx + dx / z), y: Math.round(d.cy + dy / z) });
      } else if (d.type === "camResize") {
        setCameraRef.current({
          width: Math.max(160, Math.round(d.cw + (2 * dx) / z)),
          height: Math.max(90, Math.round(d.ch + (2 * dy) / z)),
        });
      }
    };
    const onUp = () => {
      const d = dragRef.current;
      dragRef.current = null;
      if (d && d.type === "pan" && !d.moved && d.button === 0) deselectRef.current();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const bgDown = (e) => {
    if (playMode) return;
    dragRef.current = { type: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false, button: e.button };
  };
  const camDown = (e, type) => {
    e.stopPropagation();
    e.preventDefault();
    onSelectCamera();
    dragRef.current = { type, sx: e.clientX, sy: e.clientY, cx: camera.x, cy: camera.y, cw: camera.width, ch: camera.height, moved: false };
  };

  const hudOffset = { x: camera.x, y: camera.y };
  const frame = { left: camera.x - camera.width / 2, top: camera.y - camera.height / 2, width: camera.width, height: camera.height };

  let content;
  if (playMode) {
    const z = Math.max(0.05, Math.min(size.w / camera.width, size.h / camera.height));
    content = (
      <div style={{ position: "absolute", left: (size.w - camera.width * z) / 2, top: (size.h - camera.height * z) / 2, width: camera.width * z, height: camera.height * z, overflow: "hidden", background: camera.background }}>
        <div style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0, transform: `translate(${-camera.x * z}px, ${-camera.y * z}px) scale(${z})`, transformOrigin: "0 0" }}>
          <ScreenGuiOverlay elements={elements} selectedExtra={null} selectExtra={selectExtra} setExtraProp={setExtraProp} playMode scale={z} hudOffset={hudOffset} />
        </div>
      </div>
    );
  } else {
    const g = 50 * view.zoom;
    content = (
      <>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 0,
            height: 0,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
            transformOrigin: "0 0",
          }}
        >
          <div style={{ position: "absolute", ...frame, background: camera.background, zIndex: 0, pointerEvents: "none" }} />
          <ScreenGuiOverlay elements={elements} selectedExtra={selectedExtra} selectExtra={selectExtra} setExtraProp={setExtraProp} playMode={false} scale={view.zoom} hudOffset={hudOffset} />
          <div style={{ position: "absolute", ...frame, zIndex: 200000, pointerEvents: "none", boxSizing: "border-box", border: `${2 / view.zoom}px solid ${cameraSelected ? COLORS.accent : "rgba(255,255,255,0.55)"}` }} />
          <div
            onMouseDown={(e) => camDown(e, "cam")}
            title="Drag to move the camera"
            style={{
              position: "absolute",
              left: frame.left,
              top: frame.top - 22 / view.zoom,
              height: 22 / view.zoom,
              padding: `0 ${8 / view.zoom}px`,
              display: "flex",
              alignItems: "center",
              gap: 6 / view.zoom,
              fontSize: 12 / view.zoom,
              whiteSpace: "nowrap",
              background: cameraSelected ? COLORS.accent : "rgba(60,60,60,0.95)",
              color: "#fff",
              borderRadius: `${4 / view.zoom}px ${4 / view.zoom}px 0 0`,
              cursor: "grab",
              zIndex: 200001,
              userSelect: "none",
            }}
          >
            📷 Camera ({camera.x}, {camera.y})
          </div>
          <div
            onMouseDown={(e) => camDown(e, "camResize")}
            title="Drag to change the camera view size"
            style={{
              position: "absolute",
              left: frame.left + frame.width - 6 / view.zoom,
              top: frame.top + frame.height - 6 / view.zoom,
              width: 12 / view.zoom,
              height: 12 / view.zoom,
              background: COLORS.accent,
              border: `${1 / view.zoom}px solid #fff`,
              cursor: "nwse-resize",
              zIndex: 200001,
            }}
          />
        </div>
        <div style={{ position: "absolute", right: 10, top: 10, display: "flex", gap: 6, alignItems: "center", zIndex: 5 }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", background: "rgba(0,0,0,0.4)", padding: "4px 8px", borderRadius: 4 }}>{Math.round(view.zoom * 100)}%</span>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setView({ x: -camera.x, y: -camera.y, zoom: 1 })}
            style={{ fontSize: 11, color: "#fff", background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 4, padding: "4px 8px", cursor: "pointer" }}
          >
            ⌖ Center on camera
          </button>
        </div>
        <div style={{ position: "absolute", left: 10, bottom: 10, color: "rgba(255,255,255,0.75)", fontSize: 11, background: "rgba(0,0,0,0.35)", padding: "5px 9px", borderRadius: 4, lineHeight: 1.5, pointerEvents: "none" }}>
          Drag background: pan &nbsp;•&nbsp; Scroll: zoom &nbsp;•&nbsp; Drag the 📷 tab: move the camera &nbsp;•&nbsp; Drag elements to move them
        </div>
      </>
    );
  }

  const g = 50 * view.zoom;
  return (
    <div
      ref={rootRef}
      onMouseDown={bgDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        backgroundColor: playMode ? "#000" : "#202124",
        backgroundImage: playMode ? "none" : "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
        backgroundSize: `${g}px ${g}px`,
        backgroundPosition: `${size.w / 2 + view.x}px ${size.h / 2 + view.y}px`,
        cursor: playMode ? "default" : "default",
      }}
    >
      {content}
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

function ContextMenu({ menu, clipboard, onAction, onClose, mode2d }) {
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
        {mode2d && isExtra && <MenuItem label="Bring Forward ↑" onClick={() => onAction("forward")} />}
        {mode2d && isExtra && <MenuItem label="Send Backward ↓" onClick={() => onAction("backward")} />}
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
                types={getAllowedTypes(service, node, ctx.mode)}
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

// ===================== Main Hub =====================

/*
  ez studio Main Hub (recoded)
  - Projects are kept with a safe storage helper: it uses localStorage when the browser allows it
    and quietly falls back to in-memory storage when it doesn't (e.g. sandboxed previews), so
    creating / deleting projects can never crash the hub.
  - Keep this file beside studio-editor.jsx.
*/

const HUB_COLORS = {
  center: "#2b2b2b",
  panel: "#252526",
  panelHover: "#313133",
  border: "#3e3e42",
  text: "#ffffff",
  muted: "#a8a8a8",
  black: "#000000",
  accent: "#3399ff",
  danger: "#d9534f",
};

const EZ_STUDIO_LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAaMAAAFoCAYAAAD6upSDAAAN8klEQVR4nO3dT5LcNBQHYDlhDyfgApyKhOtQxYYFC2ZyCw7AhhPkAqzY5gAxizBDz6Rnuu22pPek76tKFVTlj0d+0s9PdrtLAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGB2S+8DgIjWdV1r/v3Lsph7cMKEYEq1w+ZWworZKHiGFz14riWgGJniZjijhM8lwomRKGbSOyp8aq3trbJROJGZ4iWlvQEUbb2uFVSCiWwULGlsCaDsa/GRISWYyECREtq1ATT6entUOAkmolKYhHNNAM2+ph4RToKJSBQjYVwKIWvnebcGk1AiAkVId6+FkHVym1uCSSjRk+KjCwFUn2AiEwVHU0KoPaFEBgqNJl4KIWtdW3uDSShRmwKjKiEUk1AiGoVFNeeCyFoWy55QEkjUoKg4nBDKRyjRm2LiMEIoP6FEL4qIQzwPIutTbltDSSBxKwXETXRD49Il0ZLCYTfd0Bx0SbSgaNhMCM1JKFHTm94HQC6CaF5bz/UsX//OMawkXEUIcUqXxNF0RlwkiHhOl8TRrCq86nQREUKcsyVndEi8RGFwlm6ILWzbcSvbdHxFELGVbTtuZZXhCdty3Mq2HXvojHgkiDjCltrRIfFAGFFKEUQcSyCxlTBCEFGFQGILYTQ5QURNAolrWX0mJYRozYMNvEZnNCFBRA+6JF4jjCYjiOhJIPESYTQRQUQEAolzhNGEBBG9qUGeUxGTeLjCbL0IvHRhazGilOsfavBAw/ic4Am0DqIdL82sdCRkIJAoxTbd8KIH0d4/wziurU33j8YmjAaWIYiO+LPkJ5DQ9g6q9ZNzR60RO76KoOrfTzs+FDs3J3RAWYOotWjrmYc9BNLMnMzB9PgsUdYwKqX/Qq+z+5pAmtM3vQ+AOszR66zr2m2sWjzskbEOlmVJfYHDPvkqlRf1+CzRKItGlM9f9RIxtDzyPRcncRDRPtSakW3N/0VZ3wXSPGzTDcDjrnlkOVWvHWfEdX9d11Ug5SaMBmIu0sK5oKpVe+4fzcPqlVyv7bmTf7/Lv1tL7XEcbby22ju+tuvG5w0MifUOIraZPYhK+TIGD7+28IaG8QmjpEw6sqtVwuZGTsIoOV0RmW38gGvFI6E3YZSQ7TlGUiOQdEf5CKNkTDJGVKOszZVchFFSuqLjGdMcnKcxCaNEbM/BF7brxiOMoBEXEa+TG3MTRknoiuoyrvnojsYijBIwmeoSROMzh+ITRolYNI/Xekydw2MZz3EIo+Bsz9XTa0ydy2PZrhuDt3YzlShB4G3U8FSMmclZGbqiqAtq5DE7FXX8erj1nHmzd246I0KaZb04/TkFEzNzzyioDF0Rx1qW5fEX27l3lJvOCAK6JZAyrrUCGBUQUKauqNbCl+FnzyxaYB15vt07yklnBBOKdK9KJlCKziicTF1RKTqjUbUKqFrnWXeUjwcYgCd6d0rMSRgFkq0rYjwtg6hmnXuyLh9hBEB3wggopYzTFZGTMArCFh0cy1ZdLsII0BXRnTAKQFdETyMHke4oD2EEQHfCCGhC589rhFFntujoKfubFo78t23V9SWMYFLWXiIRRoRkoaxr5IcWyEkYdWSLjtFFqW1bdfEJIwC6E0aE5SK1jhkeWiAfYdTJKFt02Y+fOiLWha262IQRTMQ6S1TCCCZhe47IhFEHtgFoTcltY462J4w6cgXJaKLXdPTjm5kw4mYmeGwu8slAGMHAvGmBLL7pfQCzsRfdzqWhtngeZ8SxXNd1XUb8wYISRp2o8WPtyfjTPzPi+XDdc96yLMYmIGFEOjUWknVdhwokiy3ZCCNCa7mojhJIrYNohDGjPw8wwInsHYUgIith1JCHF3LIepqyHndk5mw7wgjYRVfEkYRRByYxR7M9t0324x+RMIIz7M68zEJODcIIkhOcjEAYQWK25xiFMGrEUzlkN2sQmbttCCNIyhrJSIQRcNGsXRHtCKPGTOocop8nXw1xu1F/rqyEEQDdCSNu5t5FW7oiRiSM4BkL8BfGgZaEEZyIvgC36oqijwPjEUbwHwsw9COMoOQIIl0RI/NNr0zLovs1Y0IvwoipZF1sW3RFWceGMdima8C7rfpYluWrXxkpn/7u7u6chMp0Rgwha9BEYfzoTRgR2uyLpK6IWdimI6zZg6gV40wEwgiA7oQRBOUJOmYijADoThjBpHRFRCKMICBP0TEbl0aNPHzwdbSr0ZqL5mhjtUXtMJp5bE9dO86LAatOZwRAd8IIJuMin4iEEQRj65MZCaPG3JiGGMzFWIQRu7mCP54FklkJIwC6E0YQhK6ImQkjCEAQMTthBJ21CqJZ78ORgzACoDvf9NrBuq6uUl8x09jMsD330s/Y8zzPMO7ZCKNGlmVZVjOAEy3LofXCf83Pdvp7Il+AeC9dG8IIOhjhuuTIn8FuAcIIJpAh/ATS3DzAAI1lCIZejM28hBE0ZLG9LNIY/fnnn70PYRq26TqxJQF9XBt2d3d3lY+EUzqjhjyVM7dIV/xctixLef/+vTnbiDACwhHc8xFG0IDFFV4njDqyQEFb1865+/v7ykfCc8IIgO6EUWMeYpiPDjind+/emasNebSboV0bBK4RoC9h1JnPG32tRyeR5aWd7HdtXf3999+Vj4RzbNPBM7bV+nNBMB9nvJPTr5PIOvFGX7SPOi+jj1MNNebEls7o+++/zzkpE9MZBWCxisl5GYdzGZ8wgldYxNrLulPAbZz1jrJv1c2yUN96bmYZpyPUmgdbzoGPX/ShMwrCgsXsIgTRhw8fqhwDlwkjuODWCwUX2pdFGKO7u7vy+fPn3ocxLZ8z6mhZlmXVEjGpCAF0alkWb13oSBgF4gOwjK51fXsxah7CCBpYlmXY+4IuoDiCMOrs+VZdpu5o5AW2hgjjlaW2jrB1rG3R9SWMoKGagTRT0BzJFl0MwgguOHqRvzWQhA4j8mh3AM8/ZNd7K2cLC+M+y7I8/qrx+2dniy4fnRE3i3AvJDMB048tujh0RkFk7o5KGXdBHfXnGpmuKCdhxGFGW7hH+3l4SlcUizAKLFt3VMo4C/goP8dsMs4ZvhBGgYzytuDsP0b24+eyh67IFl0cHmAILtOHYE+dHnOGq9WMY8xTW+rs7du3FY+EPczAgJ6/PHWkhTJKMI00pnyxtbZG2YkYhc4ogazd0Tmj/BzEEuUih/3cMwrIFRvUZY7FI4yScOUH55kbYxBGQZ27cjPp4Kk9c0JXFJMwAqA7YRSY7ghepisaizACoDthFJzuCL6mKxqPMEpKIDErtT8mYZSAKzq4jTkUnzBKwnYd2J4bmTBKTiAxC7U+NmGUiCs82MacycOLUgcw0otU4ZytXdEvv/ziayKSEUbJLMuyPP+KiVIEEuPaGkTrupbvvvuu/PjjjyZEIk5WUucCqRRf0cBY9twnWte1vHnzxkRIxj0jALpz9ZCY7oiR7X16zkMLOemMEntp0nkEluwE0XyEUXICidEIojkJo4EJJLJRs/MSRgN47YrQ5CaLW2pVV5SfMBqEycis1P4YhNFA3D8iK/eJEEaTEEhEpTYpRRgNx/0jMnGfiAfCaEACiQwEEaeE0aAEEpHtqcGPHz+Wjx8/CqJBCaOBCSQi2lN7d3d35a+//io//PCDIBqUEzuBl95hV4r32NHWniC6v78vpZTy7t07xTowndEEdEhEsKfWPnz4UEoRRDNwgifyWodUii6JOvZe8Nzf35dlWXxJ3iR0RjzSJXG0vTX166+/HnwkRCeMJnLNU0gCiaPsraXTP6crmocwmoxAooUjash9ork42ZO6dP+oFPeQ2OfWIFrXtbx580bxTcYJn5xQ4ihHdEM+0Dov23STs23HEQQRtxJGCCRuIog4ggLg0TVbdqXYtuOLoy5QBBGlCCOeEUhc45Yg+vz58+N/v337ViFRShFGnHFtIJUilGZz5HatjohTioGzBBLP3RpEv//+++N///TTT4qGJxQErxJK3BpCD2/dLsUHWXmZwuCiLYFUilAaxRFbcoKIa3m0m4u27u17DDy/I87hw9c/lCKIuOyb3gdADg+BdG2X9PDbdEm5HHUh8enTp1KKEOJ6CoXNtm7blSKUoju6m/306VP59ttvnXSupljYTSjlV2NL1SPb7KFouMmeQCpFKPVW676eIGIvhcMhhFIOQoioFBCH2RtID6xnddR+ulEQcQRFxOGEUgxCiEwUE9XcGkqlCKatWnzGSwhRg6KiqiMC6YE18LyWHzIWRNTiDQxUtfzniL9rXdfHX7OrPRY///zzk/8/8jzCOd7AQBNb3+BwyfO/ZvR1slUA//bbb6WU/8dTANGKQqOLI7fvzsm+hvbu/oQQrSk4uqsdTKeirbG9Q+eUAKInxUcYLUPpnFprcaTAOUcIEYEiJJzeoTQLIUQkipHQBNOxBBBRebSb0JYTvY8lk9NvWDWGZKA4SUnH9LWHAFrXtbx//97cJhUFS3qzBtNp91OKb1UlN8XLcEYNJ+HDyBQzw8saTv/880/5448/Hh8NFz6MTHEzpegB5WEDZqPg4YwGrysy9wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIjkXzarHADchhmQAAAAAElFTkSuQmCC";

// ----------------------------- safe storage -----------------------------

const PROJECTS_KEY = "ez-studio-projects";
const memoryStore = {};

const hubStorage = {
  get(key) {
    try {
      const v = window.localStorage.getItem(key);
      if (v != null) return v;
    } catch (e) {
      /* storage blocked — fall through to memory */
    }
    return memoryStore[key] != null ? memoryStore[key] : null;
  },
  set(key, value) {
    memoryStore[key] = value;
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      /* storage blocked — memory copy above still works for this session */
    }
  },
};

// remove the autosaved project contents that belong to a deleted project
function removeProjectData(id) {
  const key = "ez-studio-project-data:" + id;
  delete memoryStore[key];
  try { window.localStorage.removeItem(key); } catch (e) { /* blocked */ }
  try { if (window.storage && window.storage.delete) Promise.resolve(window.storage.delete(key)).catch(() => {}); } catch (e) { /* ignore */ }
}

function loadProjects() {
  try {
    const parsed = JSON.parse(hubStorage.get(PROJECTS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((p) => p && p.id && p.name) : [];
  } catch (e) {
    return [];
  }
}

function persistProjects(list) {
  hubStorage.set(PROJECTS_KEY, JSON.stringify(list));
}

// ----------------------------- icons -----------------------------

const HubIcon = ({ children, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const GearGlyph = () => (
  <HubIcon>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </HubIcon>
);

const HelpGlyph = () => (
  <HubIcon>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01" />
  </HubIcon>
);

const HubPlusIcon = () => (
  <HubIcon size={26}>
    <path d="M12 5v14M5 12h14" />
  </HubIcon>
);

const ProjectGlyph = () => (
  <HubIcon size={22}>
    <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
  </HubIcon>
);

// ----------------------------- shared bits -----------------------------

const iconButtonStyle = {
  width: 38,
  height: 38,
  display: "grid",
  placeItems: "center",
  background: "transparent",
  border: "1px solid transparent",
  borderRadius: 6,
  color: "#ffffff",
  cursor: "pointer",
};

const ghostButtonStyle = {
  padding: "8px 14px",
  borderRadius: 6,
  border: `1px solid ${HUB_COLORS.border}`,
  background: "transparent",
  color: HUB_COLORS.text,
  cursor: "pointer",
  fontSize: 13,
};

const primaryButtonStyle = {
  padding: "8px 16px",
  borderRadius: 6,
  border: `1px solid ${HUB_COLORS.accent}`,
  background: HUB_COLORS.accent,
  color: "#ffffff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};

function HubButton({ style, hoverStyle, children, ...rest }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      {...rest}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...style, ...(hover ? hoverStyle : null) }}
    >
      {children}
    </button>
  );
}

function Modal({ title, children, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "grid", placeItems: "center", zIndex: 10000 }}
    >
      <div style={{ width: "min(480px, calc(100% - 32px))", background: HUB_COLORS.panel, border: `1px solid ${HUB_COLORS.border}`, borderRadius: 10, boxShadow: "0 20px 70px rgba(0,0,0,.55)", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${HUB_COLORS.border}`, display: "flex", alignItems: "center" }}>
          <strong style={{ fontSize: 15 }}>{title}</strong>
          <button onClick={onClose} aria-label="Close" style={{ marginLeft: "auto", background: "transparent", border: 0, color: HUB_COLORS.muted, fontSize: 22, lineHeight: 1, cursor: "pointer" }}>
            ×
          </button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

const modalTextStyle = { margin: 0, color: HUB_COLORS.muted, fontSize: 13, lineHeight: 1.6 };

// ----------------------------- hub home -----------------------------

function MainHubHome({ onOpenEditor }) {
  const [projects, setProjects] = useState(loadProjects);
  const [showCreate, setShowCreate] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const getUnnamedName = (list) => {
    let n = 0;
    while (list.some((p) => p.name === `Unnamed ${n}`)) n++;
    return `Unnamed ${n}`;
  };

  const updateProjects = (next) => {
    setProjects(next);
    persistProjects(next);
  };

  // picking the game type creates the project and opens the matching editor straight away
  const createProject = (mode) => {
    const name = projectName.trim() || getUnnamedName(projects);
    const project = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, mode, createdAt: Date.now() };
    updateProjects([...projects, project]);
    setProjectName("");
    setShowCreate(false);
    onOpenEditor(project);
  };

  const confirmDelete = () => {
    if (pendingDelete) {
      removeProjectData(pendingDelete.id);
      updateProjects(projects.filter((p) => p.id !== pendingDelete.id));
    }
    setPendingDelete(null);
  };

  return (
    <div style={{ minHeight: "100vh", width: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", background: HUB_COLORS.center, color: HUB_COLORS.text, fontFamily: '"Segoe UI", Inter, system-ui, sans-serif' }}>
      <header style={{ height: 58, flexShrink: 0, display: "flex", alignItems: "center", padding: "0 28px", background: HUB_COLORS.black, borderBottom: "1px solid #202020" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={EZ_STUDIO_LOGO} alt="ez studio logo" style={{ width: 38, height: 38, objectFit: "contain" }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>ez studio</div>
            <div style={{ fontSize: 10, letterSpacing: 1 }}>MAIN HUB</div>
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <HubButton title="Help" onClick={() => setShowHelp(true)} style={iconButtonStyle} hoverStyle={{ background: HUB_COLORS.panelHover }}>
            <HelpGlyph />
          </HubButton>
          <HubButton title="Settings" onClick={() => setShowSettings(true)} style={iconButtonStyle} hoverStyle={{ background: HUB_COLORS.panelHover }}>
            <GearGlyph />
          </HubButton>
        </div>
      </header>

      <main style={{ width: "min(1050px, calc(100% - 48px))", margin: "0 auto", padding: "48px 0 64px", flex: 1, boxSizing: "border-box" }}>
        <section style={{ marginBottom: 36 }}>
          <img src={EZ_STUDIO_LOGO} alt="" style={{ width: 120, height: 100, objectFit: "contain", display: "block", marginBottom: 14 }} />
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.4 }}>welcome to</div>
          <h1 style={{ margin: "8px 0", fontSize: 40, lineHeight: 1.1, letterSpacing: -0.8 }}>ez studio</h1>
          <p style={{ margin: 0, fontSize: 14, color: HUB_COLORS.muted }}>the easiest studio you can use</p>
        </section>

        <section style={{ marginBottom: 34 }}>
          <HubButton
            onClick={() => setShowCreate(true)}
            style={{ width: "100%", minHeight: 94, display: "flex", alignItems: "center", gap: 18, padding: "20px 24px", textAlign: "left", background: HUB_COLORS.panel, border: `1px solid ${HUB_COLORS.accent}`, borderRadius: 10, color: HUB_COLORS.text, cursor: "pointer" }}
            hoverStyle={{ background: HUB_COLORS.panelHover }}
          >
            <span style={{ display: "flex", color: HUB_COLORS.accent }}>
              <HubPlusIcon />
            </span>
            <span style={{ fontSize: 18, fontWeight: 650 }}>Create New Project</span>
          </HubButton>
        </section>

        <section>
          <div style={{ fontSize: 13, fontWeight: 650, marginBottom: 10 }}>Projects</div>
          <div style={{ background: HUB_COLORS.panel, border: `1px solid ${HUB_COLORS.border}`, borderRadius: 10, padding: 8, minHeight: 110 }}>
            {projects.length === 0 ? (
              <div style={{ minHeight: 110, display: "grid", placeItems: "center", color: HUB_COLORS.muted, fontSize: 13 }}>
                No projects yet. Create one to get started.
              </div>
            ) : (
              projects.map((project, i) => (
                <div
                  key={project.id}
                  style={{ display: "flex", alignItems: "center", gap: 14, padding: 13, borderTop: i === 0 ? "none" : `1px solid ${HUB_COLORS.border}` }}
                >
                  <span style={{ display: "flex", color: HUB_COLORS.accent }}>
                    <ProjectGlyph />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{project.name}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, border: `1px solid ${HUB_COLORS.border}`, color: HUB_COLORS.muted }}>
                        {(project.mode || "3d").toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: HUB_COLORS.muted, marginTop: 3 }}>
                      Created {new Date(project.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <HubButton onClick={() => onOpenEditor(project)} style={primaryButtonStyle} hoverStyle={{ filter: "brightness(1.12)" }}>
                    Edit
                  </HubButton>
                  <HubButton onClick={() => setPendingDelete(project)} style={ghostButtonStyle} hoverStyle={{ borderColor: HUB_COLORS.danger, color: HUB_COLORS.danger }}>
                    Delete
                  </HubButton>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      <footer style={{ padding: "14px 28px", borderTop: `1px solid ${HUB_COLORS.border}`, background: HUB_COLORS.black, color: HUB_COLORS.muted, fontSize: 11, display: "flex", justifyContent: "space-between" }}>
        <span>ez studio Main Hub</span>
        <span>{projects.length} project{projects.length === 1 ? "" : "s"}</span>
      </footer>

      {showCreate && (
        <Modal title="Create New Project" onClose={() => setShowCreate(false)}>
          <label style={{ display: "block", color: HUB_COLORS.muted, fontSize: 12, marginBottom: 8 }}>Project name</label>
          <input
            autoFocus
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder={getUnnamedName(projects)}
            maxLength={60}
            style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 6, border: `1px solid ${HUB_COLORS.border}`, outline: "none", background: "#1b1b1c", color: HUB_COLORS.text, fontSize: 14 }}
          />
          <div style={{ color: HUB_COLORS.muted, fontSize: 11, marginTop: 8 }}>
            Leave it empty and it will be called <strong>{getUnnamedName(projects)}</strong>.
          </div>

          <div style={{ fontSize: 13, fontWeight: 650, margin: "22px 0 10px" }}>Is it a 2D or a 3D game?</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { mode: "2d", title: "2D game", text: "Layers, a draggable camera, and a GUI-style world", glyph: "▤" },
              { mode: "3d", title: "3D game", text: "Workspace, lighting, parts, rigs and a player", glyph: "🧊" },
            ].map((choice) => (
              <HubButton
                key={choice.mode}
                onClick={() => createProject(choice.mode)}
                style={{ textAlign: "left", padding: 16, borderRadius: 10, border: `1px solid ${HUB_COLORS.border}`, background: "#1b1b1c", color: HUB_COLORS.text, cursor: "pointer", display: "flex", flexDirection: "column", gap: 6 }}
                hoverStyle={{ borderColor: HUB_COLORS.accent, background: HUB_COLORS.panelHover }}
              >
                <span style={{ fontSize: 26, lineHeight: 1 }}>{choice.glyph}</span>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{choice.title}</span>
                <span style={{ fontSize: 11, color: HUB_COLORS.muted, lineHeight: 1.4 }}>{choice.text}</span>
              </HubButton>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
            <button onClick={() => setShowCreate(false)} style={ghostButtonStyle}>Cancel</button>
          </div>
        </Modal>
      )}

      {pendingDelete && (
        <Modal title="Delete project?" onClose={() => setPendingDelete(null)}>
          <p style={modalTextStyle}>
            "{pendingDelete.name}" will be removed from your project list. This can't be undone.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
            <button onClick={() => setPendingDelete(null)} style={ghostButtonStyle}>Cancel</button>
            <button onClick={confirmDelete} style={{ ...primaryButtonStyle, background: HUB_COLORS.danger, borderColor: HUB_COLORS.danger }}>Delete</button>
          </div>
        </Modal>
      )}

      {showHelp && (
        <Modal title="Help" onClose={() => setShowHelp(false)}>
          <p style={modalTextStyle}>
            Create a project, choose whether it's a 2D or 3D game, and the matching editor opens. Press <strong>Edit</strong> on a project to come back to it — your work is autosaved. Inside the studio use
            <strong> File → Save Project</strong> to download your work as a zip and <strong>File → Load Project</strong> to bring it back.
          </p>
        </Modal>
      )}

      {showSettings && (
        <Modal title="Settings" onClose={() => setShowSettings(false)}>
          <p style={modalTextStyle}>Application-wide settings will go here.</p>
        </Modal>
      )}
    </div>
  );
}

// ----------------------------- app shell -----------------------------

export default function MainHub() {
  const [activeProject, setActiveProject] = useState(null);

  useEffect(() => {
    document.title = activeProject ? `${activeProject.name} — ez studio` : "ez studio — Main Hub";
  }, [activeProject]);

  if (activeProject) {
    return (
      <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
        <StudioEditor key={activeProject.id} projectName={activeProject.name} projectId={activeProject.id} mode={activeProject.mode || "3d"} onExit={() => setActiveProject(null)} />
      </div>
    );
  }

  return <MainHubHome onOpenEditor={setActiveProject} />;
}
