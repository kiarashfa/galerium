import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import { useMuseum } from '../store'
import { EYE_HEIGHT, type RoomSpec } from './layout'

const CENTER = new THREE.Vector2(0, 0)
const INSPECT_RANGE = 7.5

interface Props {
  room: RoomSpec
  meshesRef: React.MutableRefObject<Map<string, THREE.Mesh>>
  onLockChange: (locked: boolean) => void
  registerLock: (fn: () => void) => void
  /** drag-to-look mode for touch devices and environments that deny pointer lock */
  fallback: boolean
  onLockError: () => void
  /** virtual joystick vector (x=strafe, y=forward, each in [-1,1]) */
  moveInput: React.MutableRefObject<{ x: number; y: number }>
}

export default function Player({
  room,
  meshesRef,
  onLockChange,
  registerLock,
  fallback,
  onLockError,
  moveInput,
}: Props) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const inspecting = useMuseum((s) => s.inspectPaintingId) != null
  const inspectingRef = useRef(inspecting)
  inspectingRef.current = inspecting

  const controls = useMemo(() => new PointerLockControls(camera, gl.domElement), [camera, gl])
  const keys = useRef<Record<string, boolean>>({})
  const vel = useRef(new THREE.Vector2(0, 0))
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const hotRef = useRef(false)

  // spawn looking into the room
  useEffect(() => {
    camera.position.set(...room.spawn)
    camera.lookAt(0, EYE_HEIGHT, -room.depth / 4)
  }, [camera, room])

  useEffect(() => {
    const onLock = () => onLockChange(true)
    const onUnlock = () => onLockChange(false)
    const onLockErr = () => onLockError()
    controls.addEventListener('lock', onLock)
    controls.addEventListener('unlock', onUnlock)
    document.addEventListener('pointerlockerror', onLockErr)
    registerLock(() => controls.lock())
    return () => {
      controls.removeEventListener('lock', onLock)
      controls.removeEventListener('unlock', onUnlock)
      document.removeEventListener('pointerlockerror', onLockErr)
      if (controls.isLocked) controls.unlock()
      controls.disconnect()
    }
  }, [controls, onLockChange, registerLock, onLockError])

  // fallback: drag-to-look on the canvas (touch devices, or pointer lock denied).
  // Tracks a single pointerId so a second finger (e.g. on the joystick, or an
  // accidental multi-touch) never makes the camera jump.
  useEffect(() => {
    if (!fallback) return
    const el = gl.domElement
    const euler = new THREE.Euler(0, 0, 0, 'YXZ')
    let lookId: number | null = null
    let moved = 0
    let lx = 0
    let ly = 0
    const onDown = (e: PointerEvent) => {
      if ((e.pointerType === 'mouse' && e.button !== 0) || inspectingRef.current) return
      if (lookId != null) return
      lookId = e.pointerId
      moved = 0
      lx = e.clientX
      ly = e.clientY
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== lookId) return
      const dx = e.clientX - lx
      const dy = e.clientY - ly
      moved += Math.abs(dx) + Math.abs(dy)
      lx = e.clientX
      ly = e.clientY
      euler.setFromQuaternion(camera.quaternion)
      euler.y -= dx * 0.0034
      euler.x = THREE.MathUtils.clamp(euler.x - dy * 0.0034, -1.45, 1.45)
      camera.quaternion.setFromEuler(euler)
    }
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== lookId) return
      lookId = null
      if (moved < 5 && !inspectingRef.current) {
        // a clean click: raycast at the cursor to inspect
        const rect = el.getBoundingClientRect()
        const ndc = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        )
        raycaster.setFromCamera(ndc, camera)
        const hit = raycaster.intersectObjects([...meshesRef.current.values()], false)[0]
        if (hit && hit.distance < INSPECT_RANGE) {
          const id = hit.object.userData.paintingId as string
          if (id) useMuseum.getState().inspect(id)
        }
      }
    }
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    el.style.cursor = 'grab'
    el.style.touchAction = 'none'
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      el.style.cursor = ''
      el.style.touchAction = ''
    }
  }, [fallback, camera, gl, meshesRef, raycaster])

  useEffect(() => {
    const down = (e: KeyboardEvent) => (keys.current[e.code] = true)
    const up = (e: KeyboardEvent) => (keys.current[e.code] = false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // click on a painting while walking -> inspect
  useEffect(() => {
    const onMouseDown = () => {
      if (!controls.isLocked || inspectingRef.current) return
      raycaster.setFromCamera(CENTER, camera)
      const meshes = [...meshesRef.current.values()]
      const hit = raycaster.intersectObjects(meshes, false)[0]
      if (hit && hit.distance < INSPECT_RANGE) {
        const id = (hit.object.userData.paintingId as string) ?? null
        if (id) {
          controls.unlock()
          useMuseum.getState().inspect(id)
        }
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [camera, controls, meshesRef, raycaster])

  useFrame((_, rawDt) => {
    // clamp guards against huge steps after tab switches, while still letting
    // low-fps (software-rendered) environments make reasonable progress
    const dt = Math.min(rawDt, 0.1)
    // lightweight state beacon for automated tests / debugging
    ;(window as unknown as Record<string, unknown>).__museum = {
      x: camera.position.x,
      z: camera.position.z,
      yaw: new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ').y,
      locked: controls.isLocked,
      fallback,
      hot: hotRef.current,
    }
    if ((!controls.isLocked && !fallback) || inspectingRef.current) return

    const k = keys.current
    const j = moveInput.current
    const fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) + j.y
    const strafe = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + j.x
    const speed = k.ShiftLeft || k.ShiftRight ? 4.4 : 2.7

    const target = new THREE.Vector2(strafe, fwd)
    if (target.lengthSq() > 1) target.normalize()
    target.multiplyScalar(speed)
    vel.current.lerp(target, 1 - Math.exp(-dt * 10))

    if (controls.isLocked) {
      controls.moveRight(vel.current.x * dt)
      controls.moveForward(vel.current.y * dt)
    } else {
      // fallback mode: move in the camera's ground plane manually
      const forward = new THREE.Vector3()
      camera.getWorldDirection(forward)
      forward.y = 0
      forward.normalize()
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0))
      camera.position.addScaledVector(forward, vel.current.y * dt)
      camera.position.addScaledVector(right, vel.current.x * dt)
    }

    // stay inside the room
    const m = 0.55
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -room.width / 2 + m, room.width / 2 - m)
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -room.depth / 2 + m, room.depth / 2 - m)
    camera.position.y = EYE_HEIGHT

    // crosshair heat: is a painting under the crosshair, in range?
    raycaster.setFromCamera(CENTER, camera)
    const hit = raycaster.intersectObjects([...meshesRef.current.values()], false)[0]
    const hot = !!hit && hit.distance < INSPECT_RANGE
    if (hot !== hotRef.current) {
      hotRef.current = hot
      document.getElementById('crosshair')?.classList.toggle('is-hot', hot)
    }
  })

  return null
}
