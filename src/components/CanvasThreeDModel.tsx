import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CanvasThreeDConfig } from '../../shared/types';
import { DEFAULT_THREE_D_CONFIG } from './CanvasThreeDObject';

interface CanvasThreeDModelProps {
  modelSrc: string;
  config?: CanvasThreeDConfig;
  flipX?: boolean;
  flipY?: boolean;
}

/**
 * Renders an imported `.glb` (binary glTF) 3D model using Three.js `GLTFLoader`.
 * Normalizes the model's bounding box to fit the element container, plays any embedded
 * glTF animations, and applies the element's 3D tilt/motion preset.
 */
export const CanvasThreeDModel: React.FC<CanvasThreeDModelProps> = ({
  modelSrc,
  config = DEFAULT_THREE_D_CONFIG,
  flipX = false,
  flipY = false
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const configRef = useRef(config);
  configRef.current = config;
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let rafId = 0;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true
      });
      setFallbackMessage(null);
    } catch (err) {
      console.warn('[CanvasThreeDModel] WebGL unavailable:', err);
      setFallbackMessage('3D Model (WebGL unavailable)');
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.pointerEvents = 'none';
    host.innerHTML = '';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 100);
    camera.position.set(0, 0, 4.1);

    // 3-point studio lighting for PBR glTF materials
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 0.75));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.45);
    keyLight.position.set(3, 4, 5);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xe2e8f0, 0.65);
    fillLight.position.set(-3, 1, 4);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xc4b5fd, 0.8);
    rimLight.position.set(-4, -2, -3);
    scene.add(rimLight);

    const pivot = new THREE.Group();
    scene.add(pivot);

    let loadedRoot: THREE.Object3D | null = null;
    let mixer: THREE.AnimationMixer | null = null;

    const resize = () => {
      if (disposed) return;
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    resize();

    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(host);

    const loader = new GLTFLoader();
    loader.load(
      modelSrc,
      (gltf) => {
        if (disposed) return;
        const root = gltf.scene;

        // Center and normalize model scale so it fits cleanly in ~2.1 world units
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        const maxDim = Math.max(size.x, size.y, size.z, 0.0001);
        const normScale = 2.1 / maxDim;
        root.position.set(-center.x * normScale, -center.y * normScale, -center.z * normScale);
        root.scale.set(
          normScale * (flipX ? -1 : 1),
          normScale * (flipY ? -1 : 1),
          normScale
        );

        loadedRoot = root;
        pivot.add(root);

        if (gltf.animations && gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(root);
          for (const clip of gltf.animations) {
            mixer.clipAction(clip).play();
          }
        }
      },
      undefined,
      (err) => {
        if (disposed) return;
        console.warn('[CanvasThreeDModel] Failed to load .glb model:', modelSrc, err);
        setFallbackMessage('Failed to load 3D model');
      }
    );

    const startMs = performance.now();
    let prevMs = startMs;
    const renderLoop = (nowMs: number) => {
      if (disposed) return;
      const dtSec = Math.min(0.1, (nowMs - prevMs) / 1000);
      prevMs = nowMs;

      const cfg = configRef.current;
      const speed = Math.max(0.1, Math.min(4, cfg.speed || 1));
      const t = ((nowMs - startMs) / 1000) * speed;

      if (mixer) {
        mixer.update(dtSec * speed);
      }

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
      if (mixer) {
        mixer.stopAllAction();
      }
      if (loadedRoot) {
        loadedRoot.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry?.dispose();
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (const m of mats) {
              if (!m) continue;
              for (const val of Object.values(m)) {
                if (val && typeof val === 'object' && 'isTexture' in val) {
                  (val as THREE.Texture).dispose();
                }
              }
              m.dispose();
            }
          }
        });
      }
      renderer.dispose();
    };
  }, [modelSrc, flipX, flipY]);

  if (fallbackMessage) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(15, 23, 42, 0.72)',
          border: '1px dashed rgba(148, 163, 184, 0.4)',
          borderRadius: '8px',
          color: '#cbd5e1',
          fontSize: '0.78rem',
          padding: '8px',
          textAlign: 'center',
          pointerEvents: 'none'
        }}
      >
        {fallbackMessage}
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
