import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useTexture } from '@react-three/drei'
import { asset } from '../data'
import { makeLabelTexture } from './textures'
import { isRestricted } from '../types'
import type { Placement } from './layout'

const FRAME_W = 0.09
const FRAME_D = 0.07

interface Props {
  placement: Placement
  artistName: string
  register: (mesh: THREE.Mesh | null, paintingId: string) => void
}

export default function PaintingMesh({ placement, artistName, register }: Props) {
  const { painting, position, rotationY, width, height } = placement
  const url = asset(painting.image)
  const texture = useTexture(url)
  const canvasRef = useRef<THREE.Mesh>(null)

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    texture.needsUpdate = true
  }, [texture])

  // free GPU memory when leaving the gallery
  useEffect(
    () => () => {
      texture.dispose()
      useTexture.clear(url)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  useEffect(() => {
    register(canvasRef.current, painting.id)
    return () => register(null, painting.id)
  }, [register, painting.id])

  const label = useMemo(
    () => makeLabelTexture(painting.title, painting.yearText, artistName, isRestricted(painting)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [painting.title, painting.yearText, artistName, painting.license],
  )
  useEffect(() => () => label.dispose(), [label])

  const frameMat = (
    <meshStandardMaterial color="#8a6a2c" metalness={0.85} roughness={0.34} envMapIntensity={1.5} />
  )

  return (
    <group position={position} rotation-y={rotationY}>
      {/* backing */}
      <mesh position-z={-0.02} castShadow>
        <boxGeometry args={[width + FRAME_W * 2, height + FRAME_W * 2, 0.04]} />
        <meshStandardMaterial color="#241a10" roughness={0.8} />
      </mesh>
      {/* gilded frame */}
      <mesh position={[0, height / 2 + FRAME_W / 2, FRAME_D / 2 - 0.02]} castShadow>
        <boxGeometry args={[width + FRAME_W * 2, FRAME_W, FRAME_D]} />
        {frameMat}
      </mesh>
      <mesh position={[0, -height / 2 - FRAME_W / 2, FRAME_D / 2 - 0.02]} castShadow>
        <boxGeometry args={[width + FRAME_W * 2, FRAME_W, FRAME_D]} />
        {frameMat}
      </mesh>
      <mesh position={[-width / 2 - FRAME_W / 2, 0, FRAME_D / 2 - 0.02]} castShadow>
        <boxGeometry args={[FRAME_W, height, FRAME_D]} />
        {frameMat}
      </mesh>
      <mesh position={[width / 2 + FRAME_W / 2, 0, FRAME_D / 2 - 0.02]} castShadow>
        <boxGeometry args={[FRAME_W, height, FRAME_D]} />
        {frameMat}
      </mesh>
      {/* the canvas itself */}
      <mesh ref={canvasRef} position-z={0.012} userData={{ paintingId: painting.id }}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={texture} roughness={0.88} metalness={0} envMapIntensity={0.22} />
      </mesh>
      {/* wall label */}
      <mesh position={[width / 2 + FRAME_W + 0.32, -0.18, 0.002]}>
        <planeGeometry args={[0.42, 0.236]} />
        <meshStandardMaterial map={label} roughness={0.9} />
      </mesh>
    </group>
  )
}
