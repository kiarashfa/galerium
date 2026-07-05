import { useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { MeshReflectorMaterial } from '@react-three/drei'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import PaintingMesh from './PaintingMesh'
import { makeCeilingTexture, makeFloorTexture, makeNoticeTexture, makePlacardMaps, makePlasterTexture } from './textures'
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
  const placard = useMemo(
    () => makePlacardMaps(artistName, periodName, datesText, periodColor),
    [artistName, periodName, datesText, periodColor],
  )
  const noticeQuiet = useMemo(() => makeNoticeTexture('quiet'), [])
  const noticeFlash = useMemo(() => makeNoticeTexture('noflash'), [])
  useEffect(
    () => () => {
      floorTex.dispose()
      plasterTex.dispose()
      ceilingTex.dispose()
      placard.dispose()
      noticeQuiet.dispose()
      noticeFlash.dispose()
    },
    [floorTex, plasterTex, ceilingTex, placard, noticeQuiet, noticeFlash],
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

      {/* grand wing placard on the far short wall — a mounted stone tablet with
          raised gold lettering (bump + metalness maps) framed in gilt bronze */}
      <group position={[0, 2.35, -depth / 2 + 0.02]}>
        {/* limestone tablet, proud of the wall */}
        <mesh position-z={0.02} castShadow>
          <boxGeometry args={[8.5, 4.5, 0.1]} />
          <meshStandardMaterial color="#cabd9f" roughness={0.9} metalness={0} />
        </mesh>
        {/* raised-gold lettering panel */}
        <mesh position-z={0.075}>
          <planeGeometry args={[8, 4]} />
          <meshStandardMaterial
            map={placard.map}
            bumpMap={placard.bumpMap}
            bumpScale={1.1}
            metalnessMap={placard.metalnessMap}
            metalness={1}
            roughnessMap={placard.roughnessMap}
            roughness={1}
            emissiveMap={placard.metalnessMap}
            emissive="#3a2c12"
            emissiveIntensity={0.32}
            envMapIntensity={1.1}
          />
        </mesh>
        {/* gilt-bronze bevel frame around the tablet */}
        {([
          [0, 2.28, 8.7, 0.16],
          [0, -2.28, 8.7, 0.16],
        ] as const).map(([x, y, bw, bh], i) => (
          <mesh key={`h${i}`} position={[x, y, 0.06]}>
            <boxGeometry args={[bw, bh, 0.13]} />
            <meshStandardMaterial color="#8a6a2c" metalness={0.75} roughness={0.38} />
          </mesh>
        ))}
        {([
          [-4.27, 0, 0.16, 4.72],
          [4.27, 0, 0.16, 4.72],
        ] as const).map(([x, y, bw, bh], i) => (
          <mesh key={`v${i}`} position={[x, y, 0.06]}>
            <boxGeometry args={[bw, bh, 0.13]} />
            <meshStandardMaterial color="#8a6a2c" metalness={0.75} roughness={0.38} />
          </mesh>
        ))}
      </group>
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

      {/* elegant, clickable exit door + etiquette notices on the entrance wall */}
      <ExitDoor
        depth={depth}
        doorWidth={doorWidth}
        doorHeight={doorHeight}
        register={register}
        noticeQuiet={noticeQuiet}
        noticeFlash={noticeFlash}
      />

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

const WALNUT = '#241a11'
const FRAME_WOOD = '#2c2118'
const GOLD = '#8a6a2c'

function makeExitPlateTexture(): THREE.CanvasTexture {
  const w = 256
  const h = 80
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#d9b871'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '700 54px "Inter", sans-serif'
  ctx.fillText('E  X  I  T', w / 2, h / 2 + 3)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** The clickable exit: gilded walnut double doors + a small EXIT plaque, plus two
 *  engraved etiquette notices flanking the entrance. The invisible hit plane in
 *  front is registered so the same crosshair/tap raycast that inspects paintings
 *  can trigger the exit (Player checks userData.exitDoor). */
function ExitDoor({
  depth,
  doorWidth,
  doorHeight,
  register,
  noticeQuiet,
  noticeFlash,
}: {
  depth: number
  doorWidth: number
  doorHeight: number
  register: (mesh: THREE.Mesh | null, id: string) => void
  noticeQuiet: THREE.Texture
  noticeFlash: THREE.Texture
}) {
  const exitTex = useMemo(() => makeExitPlateTexture(), [])
  useEffect(() => () => exitTex.dispose(), [exitTex])

  const registerHit = useCallback(
    (m: THREE.Mesh | null) => {
      if (m) {
        m.userData.exitDoor = true
        register(m, '__door__')
      } else register(null, '__door__')
    },
    [register],
  )

  const zWall = depth / 2
  const leafW = doorWidth / 2 - 0.03
  const leafX = doorWidth / 4
  const doorMat = <meshStandardMaterial color={WALNUT} roughness={0.5} metalness={0.15} envMapIntensity={1} />
  const goldMat = <meshStandardMaterial color={GOLD} metalness={0.78} roughness={0.36} />
  const frameMat = <meshStandardMaterial color={FRAME_WOOD} roughness={0.5} metalness={0.1} />

  // a slim gold molding frame (4 thin bars) around a leaf-local rectangle
  const molding = (pw: number, ph: number, cy: number, key: string) => (
    <group key={key} position={[0, cy, 0]}>
      {([
        [0, ph / 2, pw + 0.05, 0.05],
        [0, -ph / 2, pw + 0.05, 0.05],
      ] as const).map(([x, y, bw, bh], i) => (
        <mesh key={'h' + i} position={[x, y, 0]}>
          <boxGeometry args={[bw, bh, 0.03]} />
          {goldMat}
        </mesh>
      ))}
      {([
        [-pw / 2, 0, 0.05, ph],
        [pw / 2, 0, 0.05, ph],
      ] as const).map(([x, y, bw, bh], i) => (
        <mesh key={'v' + i} position={[x, y, 0]}>
          <boxGeometry args={[bw, bh, 0.03]} />
          {goldMat}
        </mesh>
      ))}
    </group>
  )

  return (
    <group>
      {/* two walnut leaves */}
      {([-1, 1] as const).map((s) => (
        <group key={s} position={[s * leafX, 0, zWall - 0.06]}>
          <mesh position-y={doorHeight / 2} castShadow>
            <boxGeometry args={[leafW, doorHeight, 0.1]} />
            {doorMat}
          </mesh>
          {/* recessed panels (upper large, lower short), gilt moldings */}
          <group position={[0, 0, -0.06]}>
            {molding(leafW - 0.36, doorHeight * 0.5, doorHeight * 0.62, 'up')}
            {molding(leafW - 0.36, doorHeight * 0.22, doorHeight * 0.24, 'lo')}
          </group>
          {/* gold kickplate */}
          <mesh position={[0, 0.22, -0.055]}>
            <boxGeometry args={[leafW - 0.1, 0.28, 0.02]} />
            {goldMat}
          </mesh>
        </group>
      ))}

      {/* vertical gold pull-handles at the meeting stiles */}
      {([-1, 1] as const).map((s) => (
        <mesh key={s} position={[s * 0.12, doorHeight * 0.46, zWall - 0.16]}>
          <boxGeometry args={[0.05, 0.6, 0.05]} />
          {goldMat}
        </mesh>
      ))}

      {/* wood casing: jambs + lintel */}
      {([-1, 1] as const).map((s) => (
        <mesh key={s} position={[s * (doorWidth / 2 + 0.1), doorHeight / 2, zWall - 0.02]}>
          <boxGeometry args={[0.18, doorHeight + 0.26, 0.22]} />
          {frameMat}
        </mesh>
      ))}
      <mesh position={[0, doorHeight + 0.13, zWall - 0.02]}>
        <boxGeometry args={[doorWidth + 0.38, 0.2, 0.22]} />
        {frameMat}
      </mesh>
      {/* gilded cornice + engraved EXIT plaque */}
      <mesh position={[0, doorHeight + 0.3, zWall - 0.05]}>
        <boxGeometry args={[doorWidth + 0.66, 0.13, 0.28]} />
        {goldMat}
      </mesh>
      <mesh position={[0, doorHeight + 0.13, zWall - 0.14]} rotation-y={Math.PI}>
        <planeGeometry args={[0.82, 0.24]} />
        <meshStandardMaterial
          map={exitTex}
          transparent
          emissiveMap={exitTex}
          emissive="#caa257"
          emissiveIntensity={0.6}
          roughness={0.5}
          metalness={0.2}
        />
      </mesh>

      {/* invisible hit surface for the exit raycast (a bit larger than the door) */}
      <mesh ref={registerHit} position={[0, doorHeight / 2, zWall - 0.24]} rotation-y={Math.PI}>
        <planeGeometry args={[doorWidth + 0.24, doorHeight + 0.1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {/* etiquette notices flanking the door (smaller z = toward the room) */}
      {([
        [-3.0, noticeQuiet],
        [3.0, noticeFlash],
      ] as const).map(([x, tex], i) => (
        <group key={i} position={[x, 1.55, zWall]}>
          <mesh position-z={-0.02}>
            <boxGeometry args={[1.02, 0.82, 0.05]} />
            {goldMat}
          </mesh>
          <mesh position-z={-0.05}>
            <boxGeometry args={[0.92, 0.72, 0.02]} />
            <meshStandardMaterial color="#3a2c18" roughness={0.6} metalness={0.3} />
          </mesh>
          <mesh position-z={-0.065} rotation-y={Math.PI}>
            <planeGeometry args={[0.88, 0.68]} />
            <meshStandardMaterial map={tex} roughness={0.55} metalness={0.35} />
          </mesh>
        </group>
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
