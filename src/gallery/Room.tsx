import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { MeshReflectorMaterial } from '@react-three/drei'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import PaintingMesh from './PaintingMesh'
import { makeCeilingTexture, makeFloorTexture, makePlacardTexture, makePlasterTexture } from './textures'
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
  periodName: string
  periodColor: string
  datesText: string
  register: (mesh: THREE.Mesh | null, paintingId: string) => void
  /** lighter reflections for mobile GPUs */
  lowSpec?: boolean
}

export default function Room({ room, artistName, periodName, periodColor, datesText, register, lowSpec = false }: Props) {
  const { width, depth, height, placements, doorWidth, doorHeight } = room

  const floorTex = useMemo(() => makeFloorTexture(), [])
  const plasterTex = useMemo(() => makePlasterTexture(), [])
  const ceilingTex = useMemo(() => makeCeilingTexture(), [])
  const placardTex = useMemo(
    () => makePlacardTexture(artistName, periodName, datesText, periodColor),
    [artistName, periodName, datesText, periodColor],
  )
  useEffect(
    () => () => {
      floorTex.dispose()
      plasterTex.dispose()
      ceilingTex.dispose()
      placardTex.dispose()
    },
    [floorTex, plasterTex, ceilingTex, placardTex],
  )
  floorTex.repeat.set(width / 5, depth / 5)
  plasterTex.repeat.set(6, 3)
  ceilingTex.repeat.set(width / 2.5, depth / 2.5)

  const wallMat = (
    <meshStandardMaterial color="#e2dbcb" roughness={0.94} roughnessMap={plasterTex} metalness={0} />
  )
  const trimMat = <meshStandardMaterial color="#2c2118" roughness={0.55} metalness={0.08} />

  // the far half of the room gets its own laylight; benches sit on the axis
  const benches: { z: number }[] = [{ z: 3.2 }, { z: -3.2 }]

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

      {/* coffered ceiling with a central laylight strip; a slight emissive
          lift fakes bounce light so the ceiling never reads as a void */}
      <mesh rotation-x={Math.PI / 2} position-y={height}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial
          map={ceilingTex}
          color="#b9b1a0"
          emissive="#4a4438"
          emissiveIntensity={0.4}
          roughness={0.95}
        />
      </mesh>
      <mesh position={[0, height - 0.02, 0]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[2.4, depth - 8]} />
        <meshStandardMaterial color="#f8f2e0" emissive="#f6edda" emissiveIntensity={1.4} roughness={1} />
      </mesh>
      {/* gilded frame rails around the laylight (not a solid slab) */}
      {([-1.27, 1.27] as const).map((x) => (
        <mesh key={x} position={[x, height - 0.035, 0]}>
          <boxGeometry args={[0.09, 0.07, depth - 7.85]} />
          <meshStandardMaterial color="#8a6a2c" metalness={0.7} roughness={0.4} />
        </mesh>
      ))}
      {([-(depth - 8) / 2, (depth - 8) / 2] as const).map((z) => (
        <mesh key={z} position={[0, height - 0.035, z]}>
          <boxGeometry args={[2.63, 0.07, 0.09]} />
          <meshStandardMaterial color="#8a6a2c" metalness={0.7} roughness={0.4} />
        </mesh>
      ))}

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

      {/* grand wing placard on the far short wall */}
      <mesh position={[0, 2.35, -depth / 2 + 0.02]}>
        <planeGeometry args={[8, 4]} />
        <meshStandardMaterial map={placardTex} roughness={0.92} />
      </mesh>
      <PlacardWash depth={depth} height={height} />

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

      {/* entry door on the entrance wall */}
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

      {/* benches along the central axis, long side following the room */}
      {benches.map((b, i) => (
        <group key={i} position={[0, 0, b.z]} rotation-y={Math.PI / 2}>
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

      {/* paintings + their picture lights */}
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
          position={[0, height - 0.15, b.z]}
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

/** Soft wash over the far-wall placard (no shadows — cheap). */
function PlacardWash({ depth, height }: { depth: number; height: number }) {
  const target = useMemo(() => {
    const o = new THREE.Object3D()
    o.position.set(0, 2.3, -depth / 2)
    return o
  }, [depth])
  return (
    <>
      <primitive object={target} />
      <spotLight
        position={[0, height - 0.25, -depth / 2 + 6]}
        target={target}
        angle={0.9}
        penumbra={0.9}
        intensity={18}
        decay={1.8}
        distance={16}
        color="#ffedd2"
      />
    </>
  )
}

/** One warm accent spotlight per painting, with a physical picture-light
 *  fixture (stem + barrel + glowing lens) it visibly shines from. */
function PaintingSpot({ placement, roomHeight }: { placement: RoomSpec['placements'][0]; roomHeight: number }) {
  const target = useMemo(() => {
    const o = new THREE.Object3D()
    o.position.set(...placement.position)
    return o
  }, [placement])

  const lightPos = useMemo(
    () =>
      new THREE.Vector3(
        placement.position[0] + placement.normal[0] * 1.7,
        roomHeight - 0.2,
        placement.position[2] + placement.normal[2] * 1.7,
      ),
    [placement, roomHeight],
  )
  // barrel points its -Y down the beam toward the painting centre
  const barrelQuat = useMemo(() => {
    const dir = new THREE.Vector3(...placement.position).sub(lightPos).normalize()
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir)
  }, [placement, lightPos])

  const spread = Math.max(placement.width, placement.height)
  const angle = Math.min(0.32 + spread * 0.12, 0.62)

  return (
    <>
      <primitive object={target} />
      {/* the fixture: ceiling stem + aimed barrel + emissive lens */}
      <group position={lightPos}>
        <mesh position-y={0.11}>
          <cylinderGeometry args={[0.028, 0.028, 0.22, 10]} />
          <meshStandardMaterial color="#3a2e1d" metalness={0.75} roughness={0.35} />
        </mesh>
        <group quaternion={barrelQuat}>
          <mesh>
            <cylinderGeometry args={[0.09, 0.125, 0.3, 14]} />
            <meshStandardMaterial color="#4a3a24" metalness={0.8} roughness={0.35} envMapIntensity={1.2} />
          </mesh>
          <mesh position-y={-0.14}>
            <cylinderGeometry args={[0.095, 0.095, 0.02, 14]} />
            <meshStandardMaterial color="#111" emissive="#ffedd2" emissiveIntensity={2.6} roughness={1} />
          </mesh>
        </group>
      </group>
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
