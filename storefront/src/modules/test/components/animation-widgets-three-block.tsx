"use client"

import { OrbitControls } from "@react-three/drei"
import { Canvas, useFrame } from "@react-three/fiber"
import { useRef } from "react"
import type { Mesh } from "three"

function SpinBox({ spinning }: { spinning: boolean }) {
  const mesh = useRef<Mesh>(null)

  useFrame((_, dt) => {
    if (spinning && mesh.current) {
      mesh.current.rotation.y += dt * 0.55
      mesh.current.rotation.x += dt * 0.12
    }
  })

  return (
    <mesh ref={mesh} rotation={[0.25, 0.35, 0]}>
      <boxGeometry args={[1.15, 1.15, 1.15]} />
      <meshStandardMaterial color="#FF2E63" metalness={0.35} roughness={0.42} />
    </mesh>
  )
}

type Props = {
  reducedMotion: boolean
}

export default function AnimationWidgetsThreeBlock({ reducedMotion }: Props) {
  const spin = !reducedMotion

  return (
    <div className="w-full overflow-hidden rounded-xl border border-ui-border-base bg-ui-fg-base/[0.06]">
      <div className="h-[200px] w-full">
        <Canvas camera={{ position: [0, 0, 3.6], fov: 45 }} dpr={[1, 2]}>
          <ambientLight intensity={0.55} />
          <directionalLight position={[3.5, 4, 2]} intensity={1} />
          <SpinBox spinning={spin} />
          <OrbitControls enableZoom={false} autoRotate={spin} autoRotateSpeed={0.5} />
        </Canvas>
      </div>
      <p className="border-t border-ui-border-base p-2 text-center text-[11px] text-ui-fg-muted">
        React Three Fiber + drei — drag to orbit; reduced motion disables spin.
      </p>
    </div>
  )
}
