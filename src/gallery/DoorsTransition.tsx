import { useEffect, useRef, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { useMuseum } from '../store'

interface Props {
  artistName: string
  periodName: string
}

/** Gallery doors that part once the scene's textures have loaded. */
export default function DoorsTransition({ artistName, periodName }: Props) {
  const galleryReady = useMuseum((s) => s.galleryReady)
  const { active, progress } = useProgress()
  const [open, setOpen] = useState(false)
  const mountedAt = useRef(performance.now())

  // open when loading is done — with a minimum dwell so the doors register
  useEffect(() => {
    if (open) return
    const id = window.setInterval(() => {
      const elapsed = performance.now() - mountedAt.current
      if (!active && elapsed > 1100) {
        setOpen(true)
        window.clearInterval(id)
      }
    }, 150)
    return () => window.clearInterval(id)
  }, [active, open])

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(galleryReady, 1650)
    return () => window.clearTimeout(t)
  }, [open, galleryReady])

  return (
    <div className={`doors${open ? ' is-open' : ''}`}>
      <div className="doors-panel left" />
      <div className="doors-panel right" />
      <div className="doors-plaque">
        <div className="doors-plaque-name">{artistName}</div>
        <div className="doors-plaque-sub">{periodName} Gallery</div>
      </div>
      {!open && (
        <div className="doors-progress">
          {active ? `Hanging the collection… ${Math.round(progress)}%` : 'Hanging the collection…'}
        </div>
      )}
    </div>
  )
}
