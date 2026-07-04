import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { MeshReflectorMaterial } from '@react-three/drei'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import PaintingMesh from './PaintingMesh'
import { makeFloorTexture, makePlasterTexture } from './textures'
import type { RoomSpec } from './layout'

/** Image-based lighting from three's built-in RoomEnvironment — no network fetch. */
export function Env() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = tex
    scene.environmentIntensity = 0.25
    return () => {
      scene.environment = null
      tex.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])
  return null
}

interface Props {
  room: RoomSpec
  artistName: string
  register: (mesh: THREE.Mesh | null, paintingId: string) => void
  /** lighter reflections for mobile GPUs */
  lowSpec?: boolean
}

export default function Room({ room, artistName, register, lowSpec = false }: Props) {
  const { width, depth, height, placements, doorWidth, doorHeight } = room

  const floorTex = useMemo(() => makeFloorTexture(), [])
  const plasterTex = useMemo(() => makePlasterTexture(), [])
  useEffect(
    () => () => {
      floorTex.dispose()
      plasterTex.dispose()
    },
    [floorTex, plasterTex],
  )
  floorTex.repeat.set(width / 5, depth / 5)
  plasterTex.repeat.set(6, 3)

  const wallMat = (
    <meshStandardMaterial color="#e2dbcb" roughness={0.94} roughnessMap={plasterTex} metalness={0} />
  )
  const trimMat = <meshStandardMaterial color="#2c2118" roughness={0.55} metalness={0.08} />

  const benches = useMemo(() => {
    const n = placements.length >= 6 ? 2 : 1
    return Array.from({ length: n }, (_, i) => ({
      x: 0,
      z: (i - (n - 1) / 2) * (depth / 3.2),
    }))
  }, [placements.length, depth])

  return (
    <group>
      {/* floor — reflective planks */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <MeshReflectorMaterial
          map={floorTex}
          resolution={lowSpec ? 512 : 1024}
          blur={[220, 70]}
          mixBlur={0.9}
          mixStrength={3.6}
          mirror={0.72}
          roughness={0.62}
          depthScale={0.8}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.6}
          color="#9c8b74"
          metalness={0.02}
        />
      </mesh>

      {/* ceiling — kept dark so the spotlit walls carry the scene */}
      <mesh rotation-x={Math.PI / 2} position-y={height}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#4a453c" roughness={0.98} />
      </mesh>

      {/* walls */}
      <mesh position={[0, height / 2, -depth / 2]} receiveShadow>
        <planeGeometry args={[width, height]} />
        {wallMat}
      </mesh>
      <mesh position={[0, height / 2, depth / 2]} rotation-y={Math.PI} receiveShadow>
        <planeGeometry args={[width, height]} />
        {wallMat}
      </mesh>
      <mesh position={[-width / 2, height / 2, 0]} rotation-y={Math.PI / 2} receiveShadow>
        <planeGeometry args={[depth, height]} />
        {wallMat}
      </mesh>
      <mesh position={[width / 2, height / 2, 0]} rotation-y={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[depth, height]} />
        {wallMat}
      </mesh>

      {/* baseboard + crown molding */}
      {([
        [0, -depth / 2 + 0.045, 0, width],
        [0, depth / 2 - 0.045, Math.PI, width],
        [-width / 2 + 0.045, 0, Math.PI / 2, depth],
        [width / 2 - 0.045, 0, -Math.PI / 2, depth],
      ] as const).map(([x, z, rot, len], i) => (
        <group key={i} position={[x, 0, z]} rotation-y={rot}>
          <mesh position-y={0.09} castShadow receiveShadow>
            <boxGeometry args={[len, 0.18, 0.06]} />
            {trimMat}
          </mesh>
          <mesh position-y={height - 0.07}>
            <boxGeometry args={[len, 0.14, 0.05]} />
            {trimMat}
          </mesh>
        </group>
      ))}

      {/* entry door on the front wall */}
      <group position={[0, 0, depth / 2 - 0.03]} rotation-y={Math.PI}>
        <mesh position-y={doorHeight / 2}>
          <boxGeometry args={[doorWidth, doorHeight, 0.12]} />
          <meshStandardMaterial color="#241a11" roughness={0.5} metalness={0.05} />
        </mesh>
        <mesh position-y={doorHeight + 0.09}>
          <boxGeometry args={[doorWidth + 0.3, 0.18, 0.16]} />
          {trimMat}
        </mesh>
        <mesh position={[-doorWidth / 2 - 0.07, doorHeight / 2, 0]}>
          <boxGeometry args={[0.14, doorHeight + 0.18, 0.16]} />
          {trimMat}
        </mesh>
        <mesh position={[doorWidth / 2 + 0.07, doorHeight / 2, 0]}>
          <boxGeometry args={[0.14, doorHeight + 0.18, 0.16]} />
          {trimMat}
        </mesh>
      </group>

      {/* benches */}
      {benches.map((b, i) => (
        <group key={i} position={[b.x, 0, b.z]}>
          <mesh position-y={0.46} castShadow receiveShadow>
            <boxGeometry args={[1.9, 0.09, 0.55]} />
            <meshStandardMaterial color="#3d2b1c" roughness={0.35} metalness={0.05} envMapIntensity={0.8} />
          </mesh>
          {([-0.8, 0.8] as const).map((x) => (
            <mesh key={x} position={[x, 0.21, 0]} castShadow>
              <boxGeometry args={[0.09, 0.42, 0.45]} />
              <meshStandardMaterial color="#1d150d" roughness={0.6} />
            </mesh>
          ))}
        </group>
      ))}

      {/* paintings + their dedicated spotlights */}
      {placements.map((pl) => (
        <group key={pl.painting.id}>
          <PaintingMesh placement={pl} artistName={artistName} register={register} />
          <PaintingSpot placement={pl} roomHeight={height} />
        </group>
      ))}

      {/* general room lighting */}
      <hemisphereLight args={['#d9dee8', '#3b3225', 0.5]} />
      {benches.map((b, i) => (
        <spotLight
          key={i}
          position={[b.x, height - 0.15, b.z]}
          angle={1.05}
          penumbra={0.85}
          intensity={26}
          decay={1.9}
          color="#f6edda"
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-bias={-0.0003}
        />
      ))}
    </group>
  )
}

/** One warm accent spotlight per painting, angled from the ceiling. */
function PaintingSpot({ placement, roomHeight }: { placement: RoomSpec['placements'][0]; roomHeight: number }) {
  const target = useMemo(() => {
    const o = new THREE.Object3D()
    o.position.set(...placement.position)
    return o
  }, [placement])

  const lightPos: [number, number, number] = [
    placement.position[0] + placement.normal[0] * 1.7,
    roomHeight - 0.2,
    placement.position[2] + placement.normal[2] * 1.7,
  ]
  const spread = Math.max(placement.width, placement.height)
  const angle = Math.min(0.32 + spread * 0.12, 0.62)

  return (
    <>
      <primitive object={target} />
      <spotLight
        position={lightPos}
        target={target}
        angle={angle}
        penumbra={0.62}
        intensity={34}
        decay={1.75}
        distance={12}
        color="#ffedd2"
      />
    </>
  )
}
