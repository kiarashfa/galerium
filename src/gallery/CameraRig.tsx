import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useMuseum } from '../store'
import { easeInOutCubic } from '../timeline/camera'
import type { RoomSpec } from './layout'

/** Glides the camera up to a painting when inspection starts. */
export default function CameraRig({ room }: { room: RoomSpec }) {
  const camera = useThree((s) => s.camera)
  const inspectId = useMuseum((s) => s.inspectPaintingId)
  const anim = useRef<{
    fromPos: THREE.Vector3
    toPos: THREE.Vector3
    fromQuat: THREE.Quaternion
    toQuat: THREE.Quaternion
    t0: number
  } | null>(null)

  useEffect(() => {
    if (!inspectId) {
      anim.current = null
      return
    }
    const pl = room.placements.find((p) => p.painting.id === inspectId)
    if (!pl) return
    const center = new THREE.Vector3(...pl.position)
    const normal = new THREE.Vector3(...pl.normal)
    const dist = THREE.MathUtils.clamp(Math.max(pl.width, pl.height) * 1.05 + 0.55, 1.7, 4.2)
    const toPos = center.clone().addScaledVector(normal, dist)

    const look = new THREE.Matrix4().lookAt(toPos, center, new THREE.Vector3(0, 1, 0))
    const toQuat = new THREE.Quaternion().setFromRotationMatrix(look)

    anim.current = {
      fromPos: camera.position.clone(),
      toPos,
      fromQuat: camera.quaternion.clone(),
      toQuat,
      t0: performance.now(),
    }
  }, [inspectId, room, camera])

  useFrame(() => {
    const a = anim.current
    if (!a) return
    const p = Math.min((performance.now() - a.t0) / 850, 1)
    const e = easeInOutCubic(p)
    camera.position.lerpVectors(a.fromPos, a.toPos, e)
    camera.quaternion.slerpQuaternions(a.fromQuat, a.toQuat, e)
    if (p >= 1) anim.current = null
  })

  return null
}
