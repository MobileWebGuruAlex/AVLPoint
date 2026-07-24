"use client";
"use no memo";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { scrollState } from "../scroll-state";

/**
 * The living 3D layer above the film — atmosphere the clips can't provide
 * once they're scrubbed frame-by-frame:
 *   - drifting weld-dust motes (cyan-white, additive)
 *   - rare gold embers rising like grinder sparks
 *   - vertical light streaks that stretch with scroll velocity, selling
 *     "travel" between chapters and masking crossfade seams
 * Everything reads scrollState directly inside useFrame — zero React churn.
 */

function useIsSmall() {
  return useMemo(
    () =>
      typeof window !== "undefined" &&
      (window.innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4),
    []
  );
}

function Dust({ count }: { count: number }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const a = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      a[i * 3] = (Math.random() - 0.5) * 16;
      a[i * 3 + 1] = (Math.random() - 0.5) * 9;
      a[i * 3 + 2] = (Math.random() - 0.5) * 6;
    }
    return a;
  }, [count]);

  useFrame(({ clock }) => {
    const pts = ref.current;
    if (!pts) return;
    const t = clock.elapsedTime;
    pts.rotation.y = t * 0.008 + scrollState.p * 0.6;
    pts.position.y = ((scrollState.p * 2.2) % 1) * -0.4 + Math.sin(t * 0.11) * 0.12;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.03}
        color="#9fd8ff"
        transparent
        opacity={0.55}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

function Embers({ count }: { count: number }) {
  const ref = useRef<THREE.Points>(null);
  const seeds = useMemo(() => {
    const a = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      a[i * 3] = (Math.random() - 0.5) * 13;
      a[i * 3 + 1] = (Math.random() - 0.5) * 8;
      a[i * 3 + 2] = (Math.random() - 0.5) * 4;
    }
    return a;
  }, [count]);

  useFrame(({ clock }) => {
    const pts = ref.current;
    if (!pts) return;
    const t = clock.elapsedTime;
    pts.position.y = (t * 0.05) % 2 as number;
    const mat = pts.material as THREE.PointsMaterial;
    mat.opacity = 0.32 + Math.sin(t * 1.7) * 0.12;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[seeds, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.07}
        color="#e0b26a"
        transparent
        opacity={0.35}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

function Streaks({ count }: { count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const slots = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        x: (Math.random() - 0.5) * 14,
        y: (Math.random() - 0.5) * 8,
        z: (Math.random() - 0.5) * 3 - 0.5,
        s: 0.5 + Math.random(),
      })),
    [count]
  );

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const speed = Math.min(Math.abs(scrollState.v) * 26, 1);
    for (let i = 0; i < slots.length; i++) {
      const sl = slots[i];
      dummy.position.set(sl.x, sl.y, sl.z);
      dummy.scale.set(1, 0.05 + speed * 3.4 * sl.s, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    (mesh.material as THREE.MeshBasicMaterial).opacity = speed * 0.28;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <planeGeometry args={[0.014, 1]} />
      <meshBasicMaterial
        color="#7fd4ff"
        transparent
        opacity={0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  );
}

function Rig({ children, parallax }: { children: React.ReactNode; parallax: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const mouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!parallax) return;
    const onMove = (e: PointerEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [parallax]);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const k = Math.min(dt * 2.4, 1);
    g.rotation.y += (mouse.current.x * 0.05 - g.rotation.y) * k;
    g.rotation.x += (mouse.current.y * 0.035 - g.rotation.x) * k;
  });

  return <group ref={ref}>{children}</group>;
}

export default function Scene3D() {
  const small = useIsSmall();
  return (
    <div className="lp-accents" aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, 6], fov: 55 }}
        dpr={[1, small ? 1.5 : 1.75]}
        gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
        frameloop="always"
      >
        <Rig parallax={!small}>
          <Dust count={small ? 450 : 1200} />
          <Embers count={small ? 12 : 26} />
          <Streaks count={small ? 8 : 18} />
        </Rig>
      </Canvas>
    </div>
  );
}
