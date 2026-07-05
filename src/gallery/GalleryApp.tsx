import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { useMuseum } from '../store'
import { isTouchDevice } from '../touch'
import { computeRoom } from './layout'
import Room, { Env } from './Room'
import Player from './Player'
import CameraRig from './CameraRig'
import DoorsTransition from './DoorsTransition'
import InspectOverlay from './InspectOverlay'
import Joystick from './Joystick'

export default function GalleryApp() {
  const data = useMuseum((s) => s.data)!
  const view = useMuseum((s) => s.view)
  const galleryArtistId = useMuseum((s) => s.galleryArtistId)!
  const inspectPaintingId = useMuseum((s) => s.inspectPaintingId)
  const exitGallery = useMuseum((s) => s.exitGallery)

  const artist = data.artistById.get(galleryArtistId)!
  const period = data.periodById.get(artist.periodId)
  const paintings = useMemo(
    () => artist.paintingIds.map((id) => data.paintingById.get(id)!).filter(Boolean),
    [artist, data],
  )
  const room = useMemo(() => computeRoom(paintings, artist.tier), [paintings, artist.tier])

  const meshesRef = useRef<Map<string, THREE.Mesh>>(new Map())
  const register = useCallback((mesh: THREE.Mesh | null, paintingId: string) => {
    if (mesh) meshesRef.current.set(paintingId, mesh)
    else meshesRef.current.delete(paintingId)
  }, [])

  const [locked, setLocked] = useState(false)
  // touch devices never attempt pointer lock — drag-look + joystick from the start
  const [fallback, setFallback] = useState(isTouchDevice)
  const onLockError = useCallback(() => setFallback(true), [])
  const moveInput = useRef({ x: 0, y: 0 })
  const lockFn = useRef<() => void>(() => {})
  const registerLock = useCallback((fn: () => void) => {
    lockFn.current = fn
  }, [])

  const inspecting = inspectPaintingId != null
  const inspectPainting = inspectPaintingId ? data.paintingById.get(inspectPaintingId) : null

  // While the lightbox is open the 3D scene is static: pause the render loop
  // once the camera glide has finished. Frees the main thread (important on
  // slow/software renderers) and saves battery.
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (!inspectPaintingId) {
      setPaused(false)
      return
    }
    const t = window.setTimeout(() => setPaused(true), 1100)
    return () => window.clearTimeout(t)
  }, [inspectPaintingId])

  return (
    <div className="gallery-root">
      <Canvas
        shadows
        frameloop={paused ? 'demand' : 'always'}
        dpr={isTouchDevice ? [1, 1.5] : [1, 1.75]}
        camera={{ fov: 68, near: 0.08, far: 120, position: room.spawn }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.12
          gl.shadowMap.type = THREE.PCFSoftShadowMap
        }}
      >
        <color attach="background" args={['#07080c']} />
        <fog attach="fog" args={['#0a0b10', 14, 55]} />
        <Env />
        <Suspense fallback={null}>
          <Room
            room={room}
            artistName={artist.name}
            periodName={period?.name ?? ''}
            periodColor={period?.color ?? '#a8843a'}
            datesText={
              artist.deathYear != null
                ? `${artist.birthYear ?? '—'} – ${artist.deathYear}`
                : `b. ${artist.birthYear ?? '—'}`
            }
            register={register}
            lowSpec={isTouchDevice}
          />
        </Suspense>
        <Player
          room={room}
          meshesRef={meshesRef}
          onLockChange={setLocked}
          registerLock={registerLock}
          fallback={fallback}
          onLockError={onLockError}
          moveInput={moveInput}
        />
        <CameraRig room={room} />
      </Canvas>

      {/* HUD */}
      <div className="gallery-topbar">
        <button className="gallery-exit" onClick={exitGallery}>
          ← Timeline
        </button>
        <div className="gallery-title">
          <div className="gallery-title-name">{artist.name}</div>
          <div className="gallery-title-sub">
            {period?.name} · {paintings.length} works
          </div>
        </div>
      </div>

      {locked && !inspecting && <div id="crosshair" className="crosshair" />}
      {(locked || fallback) && !inspecting && (
        <div className="gallery-hint">
          {isTouchDevice
            ? 'Joystick to walk · drag to look · tap a painting to inspect'
            : fallback
              ? 'WASD to walk · drag to look · click a painting to inspect'
              : 'WASD to walk · look with the mouse · click a painting to inspect'}
        </div>
      )}

      {isTouchDevice && !inspecting && view === 'gallery' && <Joystick inputRef={moveInput} />}

      {!locked && !fallback && !inspecting && view === 'gallery' && (
        <div className="gallery-resume" onClick={() => lockFn.current()}>
          <div className="gallery-resume-title">{artist.name}</div>
          <div className="gallery-resume-sub">Click to walk · WASD + mouse · Esc frees the cursor</div>
        </div>
      )}

      {inspecting && inspectPainting && (
        <InspectOverlay painting={inspectPainting} artist={artist} period={period} />
      )}

      {view === 'entering' && <DoorsTransition artistName={artist.name} periodName={period?.name ?? ''} />}
    </div>
  )
}
