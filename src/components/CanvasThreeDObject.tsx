import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { CanvasThreeDConfig } from '../../shared/types';

export const DEFAULT_THREE_D_CONFIG: CanvasThreeDConfig = {
  enabled: true,
  depth: 0.18,
  bevel: 0.02,
  material: 'metallic',
  edgeColor: '#cbd5e1',
  animation: 'float',
  speed: 1,
  tiltX: 8,
  tiltY: -14
};

interface Point2D {
  x: number;
  y: number;
}

/** Ramer-Douglas-Peucker polyline simplification for smooth extruded contours. */
function simplifyClosedLoop(points: Point2D[], epsilon: number): Point2D[] {
  if (points.length <= 4) return points;
  const sqEps = epsilon * epsilon;

  const perpDistSq = (p: Point2D, a: Point2D, b: Point2D): number => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0 && dy === 0) return (p.x - a.x) ** 2 + (p.y - a.y) ** 2;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    const projX = a.x + t * dx;
    const projY = a.y + t * dy;
    return (p.x - projX) ** 2 + (p.y - projY) ** 2;
  };

  const rdp = (pts: Point2D[]): Point2D[] => {
    if (pts.length <= 2) return pts;
    let maxDist = 0;
    let index = 0;
    const end = pts.length - 1;
    for (let i = 1; i < end; i++) {
      const d = perpDistSq(pts[i], pts[0], pts[end]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > sqEps) {
      const left = rdp(pts.slice(0, index + 1));
      const right = rdp(pts.slice(index));
      return [...left.slice(0, -1), ...right];
    }
    return [pts[0], pts[end]];
  };

  // Split at farthest point from index 0 so closed loop simplifies symmetrically
  let farIdx = 1;
  let farDist = 0;
  for (let i = 1; i < points.length; i++) {
    const d = (points[i].x - points[0].x) ** 2 + (points[i].y - points[0].y) ** 2;
    if (d > farDist) {
      farDist = d;
      farIdx = i;
    }
  }
  const firstHalf = rdp(points.slice(0, farIdx + 1));
  const secondHalf = rdp([...points.slice(farIdx), points[0]]);
  return [...firstHalf.slice(0, -1), ...secondHalf.slice(0, -1)];
}

/** Chaikin corner-cutting passes to turn polygonal contours into smooth curves. */
function smoothClosedLoop(points: Point2D[], passes = 2): Point2D[] {
  let pts = points;
  for (let pass = 0; pass < passes; pass++) {
    if (pts.length < 3) break;
    const next: Point2D[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      next.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y });
      next.push({ x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
    }
    pts = next;
  }
  return pts;
}

function signedArea(pts: Point2D[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area * 0.5;
}

function pointInPolygon(p: Point2D, poly: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Extracts watertight outer shapes + inner holes from an image's alpha mask
 * using directed boundary-edge chaining on a padded binary grid.
 */
function buildShapesFromImage(
  img: HTMLImageElement
): { shapes: THREE.Shape[]; halfW: number; halfH: number } {
  const maxGrid = 180;
  const natW = Math.max(1, img.naturalWidth || 100);
  const natH = Math.max(1, img.naturalHeight || 100);
  const scale = Math.min(1, maxGrid / Math.max(natW, natH));
  const gw = Math.max(8, Math.round(natW * scale));
  const gh = Math.max(8, Math.round(natH * scale));
  const pad = 2;
  const pw = gw + pad * 2;
  const ph = gh + pad * 2;

  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const aspect = natW / natH;
  const halfW = aspect >= 1 ? 1 : aspect;
  const halfH = aspect >= 1 ? 1 / aspect : 1;

  if (!ctx) {
    const fallback = new THREE.Shape();
    fallback.moveTo(-halfW, -halfH);
    fallback.lineTo(halfW, -halfH);
    fallback.lineTo(halfW, halfH);
    fallback.lineTo(-halfW, halfH);
    fallback.closePath();
    return { shapes: [fallback], halfW, halfH };
  }

  ctx.clearRect(0, 0, pw, ph);
  ctx.drawImage(img, pad, pad, gw, gh);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, pw, ph).data;
  } catch {
    const rect = new THREE.Shape();
    rect.moveTo(-halfW, -halfH);
    rect.lineTo(halfW, -halfH);
    rect.lineTo(halfW, halfH);
    rect.lineTo(-halfW, halfH);
    rect.closePath();
    return { shapes: [rect], halfW, halfH };
  }

  const solid = new Uint8Array(pw * ph);
  let solidCount = 0;
  for (let i = 0; i < pw * ph; i++) {
    if (data[i * 4 + 3] >= 64) {
      solid[i] = 1;
      solidCount++;
    }
  }

  // Fallback to full rectangle if image is completely transparent
  if (solidCount === 0) {
    const rect = new THREE.Shape();
    rect.moveTo(-halfW, -halfH);
    rect.lineTo(halfW, -halfH);
    rect.lineTo(halfW, halfH);
    rect.lineTo(-halfW, halfH);
    rect.closePath();
    return { shapes: [rect], halfW, halfH };
  }

  // Build directed boundary edges in Y-up grid space:
  // Pixel (x, y) in top-down canvas maps to X = x - pad, Y = gh - (y - pad)
  interface DirEdge {
    ax: number;
    ay: number;
    bx: number;
    by: number;
    dx: number;
    dy: number;
    used: boolean;
  }
  const edges: DirEdge[] = [];
  const outMap = new Map<string, DirEdge[]>();

  const addEdge = (ax: number, ay: number, bx: number, by: number) => {
    const edge: DirEdge = { ax, ay, bx, by, dx: bx - ax, dy: by - ay, used: false };
    edges.push(edge);
    const key = `${ax},${ay}`;
    const list = outMap.get(key);
    if (list) list.push(edge);
    else outMap.set(key, [edge]);
  };

  const isSolid = (x: number, y: number) =>
    x >= 0 && x < pw && y >= 0 && y < ph && solid[y * pw + x] === 1;

  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      if (!isSolid(x, y)) continue;
      // Keep outer solid region on the left of every directed edge (CCW in Y-up)
      if (!isSolid(x, y - 1)) addEdge(x + 1, ph - y, x, ph - y); // top
      if (!isSolid(x + 1, y)) addEdge(x + 1, ph - (y + 1), x + 1, ph - y); // right
      if (!isSolid(x, y + 1)) addEdge(x, ph - (y + 1), x + 1, ph - (y + 1)); // bottom
      if (!isSolid(x - 1, y)) addEdge(x, ph - y, x, ph - (y + 1)); // left
    }
  }

  const loops: Point2D[][] = [];
  for (const startEdge of edges) {
    if (startEdge.used) continue;
    const loop: Point2D[] = [];
    let cur: DirEdge | undefined = startEdge;
    while (cur && !cur.used) {
      cur.used = true;
      loop.push({ x: cur.ax, y: cur.ay });
      const candidates = outMap.get(`${cur.bx},${cur.by}`);
      if (!candidates || candidates.length === 0) break;
      const unused = candidates.filter((c) => !c.used);
      if (unused.length === 0) break;
      if (unused.length === 1) {
        cur = unused[0];
      } else {
        // Rightmost turn at diagonal-touching corners keeps contours non-crossing
        const prev = cur;
        unused.sort((a, b) => {
          const crossA = prev.dx * a.dy - prev.dy * a.dx;
          const crossB = prev.dx * b.dy - prev.dy * b.dx;
          return crossA - crossB;
        });
        cur = unused[0];
      }
    }
    if (loop.length >= 4) {
      loops.push(loop);
    }
  }

  const toWorld = (p: Point2D): Point2D => ({
    x: ((p.x - pad) / gw) * (halfW * 2) - halfW,
    y: ((p.y - pad) / gh) * (halfH * 2) - halfH
  });

  const outers: { pts: Point2D[]; area: number; shape: THREE.Shape }[] = [];
  const holes: { pts: Point2D[]; area: number }[] = [];

  for (const rawLoop of loops) {
    const simplified = simplifyClosedLoop(rawLoop, 1.35);
    if (simplified.length < 3) continue;
    const area = signedArea(simplified);
    const minArea = area > 0 ? 24 : 75;
    if (Math.abs(area) < minArea) continue; // Ignore tiny alpha speckles & noisy pinholes
    const smoothed = smoothClosedLoop(simplified, 2);
    const worldPts = smoothed.map(toWorld);
    if (area > 0) {
      const shape = new THREE.Shape();
      shape.moveTo(worldPts[0].x, worldPts[0].y);
      for (let i = 1; i < worldPts.length; i++) {
        shape.lineTo(worldPts[i].x, worldPts[i].y);
      }
      shape.closePath();
      outers.push({ pts: worldPts, area, shape });
    } else {
      holes.push({ pts: worldPts, area: Math.abs(area) });
    }
  }

  // Assign each hole to the smallest enclosing outer shape
  outers.sort((a, b) => a.area - b.area);
  for (const hole of holes) {
    const probe = hole.pts[0];
    const owner = outers.find((o) => pointInPolygon(probe, o.pts));
    if (owner) {
      const path = new THREE.Path();
      path.moveTo(hole.pts[0].x, hole.pts[0].y);
      for (let i = 1; i < hole.pts.length; i++) {
        path.lineTo(hole.pts[i].x, hole.pts[i].y);
      }
      path.closePath();
      owner.shape.holes.push(path);
    }
  }

  if (outers.length === 0) {
    const rect = new THREE.Shape();
    rect.moveTo(-halfW, -halfH);
    rect.lineTo(halfW, -halfH);
    rect.lineTo(halfW, halfH);
    rect.lineTo(-halfW, halfH);
    rect.closePath();
    return { shapes: [rect], halfW, halfH };
  }

  return { shapes: outers.map((o) => o.shape), halfW, halfH };
}

interface CanvasThreeDObjectProps {
  imageSrc: string;
  config: CanvasThreeDConfig;
  flipX?: boolean;
  flipY?: boolean;
}

/**
 * Converts a PNG (or any image) into a 3D extruded Three.js mesh with
 * studio lighting, customizable edge finish, and continuous 3D animations.
 */
export const CanvasThreeDObject: React.FC<CanvasThreeDObjectProps> = ({
  imageSrc,
  config,
  flipX = false,
  flipY = false
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const configRef = useRef(config);
  configRef.current = config;
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let rafId = 0;

    // Older Windows iGPUs, Remote Desktop sessions, and VMs may lack WebGL support.
    // Catch initialization failures gracefully so a 3D element never crashes the Main Screen.
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true
      });
      setWebglUnavailable(false);
    } catch (err) {
      console.warn('[CanvasThreeDObject] WebGL unavailable, falling back to 2D image:', err);
      setWebglUnavailable(true);
      return;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.pointerEvents = 'none';
    host.innerHTML = '';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
    camera.position.set(0, 0, 4.1);

    // 3-point studio lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 0.55));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
    keyLight.position.set(3, 4, 5);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xc4b5fd, 0.75);
    rimLight.position.set(-4, -2, -3);
    scene.add(rimLight);

    const pivot = new THREE.Group();
    scene.add(pivot);

    let activeGeometry: THREE.BufferGeometry | null = null;
    let activeMaterials: THREE.Material[] = [];
    let activeTexture: THREE.Texture | null = null;

    const resize = () => {
      if (disposed) return;
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    resize();

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(host);

    let objectUrlToRevoke: string | null = null;
    const img = new Image();
    img.onload = () => {
      if (disposed) return;

      const { shapes, halfW, halfH } = buildShapesFromImage(img);
      const depth = Math.max(0.02, config.depth);
      const bevelSize = Math.max(0, config.bevel);

      const geometry = new THREE.ExtrudeGeometry(shapes, {
        depth,
        bevelEnabled: bevelSize > 0.001,
        bevelThickness: bevelSize,
        bevelSize,
        bevelSegments: bevelSize > 0.001 ? 3 : 1,
        curveSegments: 8
      });

      // Center extrusion depth around Z = 0
      geometry.translate(0, 0, -depth / 2);

      // Map front/back face UVs accurately to the original PNG
      const posAttr = geometry.attributes.position;
      const uvAttr = geometry.attributes.uv;
      for (let i = 0; i < posAttr.count; i++) {
        const vx = posAttr.getX(i);
        const vy = posAttr.getY(i);
        const u = Math.max(0, Math.min(1, (vx + halfW) / (halfW * 2)));
        const v = Math.max(0, Math.min(1, (vy + halfH) / (halfH * 2)));
        uvAttr.setXY(i, flipX ? 1 - u : u, flipY ? 1 - v : v);
      }
      uvAttr.needsUpdate = true;
      geometry.computeVertexNormals();

      const texture = new THREE.Texture(img);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;

      const edgeColor = new THREE.Color(config.edgeColor || '#cbd5e1');
      const faceMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.05,
        roughness:
          config.material === 'ice' || config.material === 'glass'
            ? 0.14
            : config.material === 'glossy'
              ? 0.18
              : config.material === 'metallic'
                ? 0.35
                : 0.6,
        metalness: config.material === 'metallic' ? 0.12 : 0.02,
        ...(config.material === 'ice'
          ? { emissive: edgeColor, emissiveIntensity: 0.1 }
          : config.material === 'glass'
            ? { emissive: edgeColor, emissiveIntensity: 0.04 }
            : {})
      });

      const sideMaterial =
        config.material === 'ice'
          ? new THREE.MeshPhysicalMaterial({
              color: edgeColor,
              emissive: edgeColor,
              emissiveIntensity: 0.45,
              roughness: 0.12,
              metalness: 0.05,
              transmission: 0.55,
              thickness: 0.6,
              ior: 1.31,
              clearcoat: 1,
              clearcoatRoughness: 0.08,
              transparent: true,
              opacity: 0.9
            })
          : config.material === 'glass'
            ? new THREE.MeshPhysicalMaterial({
                color: edgeColor,
                emissive: edgeColor,
                emissiveIntensity: 0.12,
                roughness: 0.04,
                metalness: 0.0,
                transmission: 0.85,
                thickness: 0.8,
                ior: 1.52,
                clearcoat: 1,
                clearcoatRoughness: 0.04,
                reflectivity: 0.95,
                transparent: true,
                opacity: 0.78
              })
            : config.material === 'neon'
              ? new THREE.MeshStandardMaterial({
                  color: edgeColor,
                  emissive: edgeColor,
                  emissiveIntensity: 0.85,
                  roughness: 0.25,
                  metalness: 0.2
                })
              : config.material === 'glossy'
                ? new THREE.MeshPhysicalMaterial({
                    color: edgeColor,
                    roughness: 0.14,
                    metalness: 0.1,
                    clearcoat: 1,
                    clearcoatRoughness: 0.1
                  })
                : config.material === 'metallic'
                  ? new THREE.MeshStandardMaterial({
                      color: edgeColor,
                      roughness: 0.22,
                      metalness: 0.85
                    })
                  : new THREE.MeshStandardMaterial({
                      color: edgeColor,
                      roughness: 0.78,
                      metalness: 0.05
                    });

      const mesh = new THREE.Mesh(geometry, [faceMaterial, sideMaterial]);
      pivot.add(mesh);

      activeGeometry = geometry;
      activeMaterials = [faceMaterial, sideMaterial];
      activeTexture = texture;
    };

    if (imageSrc.startsWith('data:') || imageSrc.startsWith('blob:')) {
      img.src = imageSrc;
    } else {
      void fetch(imageSrc)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.blob();
        })
        .then((blob) => {
          if (disposed) return;
          objectUrlToRevoke = URL.createObjectURL(blob);
          img.src = objectUrlToRevoke;
        })
        .catch(() => {
          if (disposed) return;
          img.crossOrigin = 'anonymous';
          img.src = imageSrc;
        });
    }

    const startTime = performance.now();
    const renderLoop = (now: number) => {
      if (disposed) return;
      const cfg = configRef.current;
      const t = ((now - startTime) / 1000) * Math.max(0.1, cfg.speed || 1);
      const baseRx = ((cfg.tiltX ?? 0) * Math.PI) / 180;
      const baseRy = ((cfg.tiltY ?? 0) * Math.PI) / 180;

      pivot.position.set(0, 0, 0);
      pivot.rotation.set(baseRx, baseRy, 0);

      switch (cfg.animation) {
        case 'spin':
          pivot.rotation.y = baseRy + t * 1.15;
          break;
        case 'float':
          pivot.position.y = Math.sin(t * 2.2) * 0.08;
          pivot.rotation.y = baseRy + Math.sin(t * 1.3) * 0.22;
          pivot.rotation.x = baseRx + Math.cos(t * 1.1) * 0.08;
          break;
        case 'tilt':
          pivot.rotation.y = baseRy + Math.sin(t * 1.8) * 0.45;
          pivot.rotation.x = baseRx + Math.cos(t * 1.4) * 0.16;
          break;
        case 'flip': {
          const cycle = t % 3.2;
          const flipProgress = cycle < 1.2 ? (1 - Math.cos((cycle / 1.2) * Math.PI)) / 2 : 1;
          pivot.rotation.y = baseRy + flipProgress * Math.PI * 2;
          break;
        }
        case 'orbit':
          pivot.position.y = Math.sin(t * 1.9) * 0.06;
          pivot.rotation.y = baseRy + t * 0.85;
          pivot.rotation.x = baseRx + Math.sin(t * 1.9) * 0.22;
          break;
        case 'none':
        default:
          break;
      }

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(renderLoop);
    };
    rafId = requestAnimationFrame(renderLoop);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      observer?.disconnect();
      if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
      activeGeometry?.dispose();
      for (const mat of activeMaterials) mat.dispose();
      activeTexture?.dispose();
      renderer.dispose();
    };
  }, [imageSrc, config.depth, config.bevel, config.material, config.edgeColor, flipX, flipY]);

  if (webglUnavailable) {
    const scaleX = flipX ? -1 : 1;
    const scaleY = flipY ? -1 : 1;
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <img
          src={imageSrc}
          alt=""
          draggable={false}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            transform: scaleX !== 1 || scaleY !== 1 ? `scale(${scaleX}, ${scaleY})` : undefined
          }}
        />
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        pointerEvents: 'none'
      }}
    />
  );
};
