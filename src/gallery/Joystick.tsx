import { useEffect, useRef } from 'react'

const RADIUS = 46 // max nub travel in px

interface Props {
  /** normalized movement vector written every gesture frame: x=strafe, y=forward, each in [-1,1] */
  inputRef: React.MutableRefObject<{ x: number; y: number }>
}

/** Fixed virtual joystick (bottom-left) for touch walking. */
export default function Joystick({ inputRef }: Props) {
  const baseRef = useRef<HTMLDivElement>(null)
  const nubRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const base = baseRef.current!
    const nub = nubRef.current!
    let activeId: number | null = null

    const apply = (e: PointerEvent) => {
      const rect = base.getBoundingClientRect()
      let dx = e.clientX - (rect.left + rect.width / 2)
      let dy = e.clientY - (rect.top + rect.height / 2)
      const len = Math.hypot(dx, dy)
      if (len > RADIUS) {
        dx = (dx / len) * RADIUS
        dy = (dy / len) * RADIUS
      }
      nub.style.transform = `translate(${dx}px, ${dy}px)`
      inputRef.current = { x: dx / RADIUS, y: -dy / RADIUS }
    }
    const reset = () => {
      activeId = null
      nub.style.transform = 'translate(0, 0)'
      inputRef.current = { x: 0, y: 0 }
    }

    const onDown = (e: PointerEvent) => {
      if (activeId != null) return
      activeId = e.pointerId
      try {
        base.setPointerCapture(e.pointerId)
      } catch {
        /* synthetic pointer */
      }
      apply(e)
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerId === activeId) apply(e)
    }
    const onUp = (e: PointerEvent) => {
      if (e.pointerId === activeId) reset()
    }

    base.addEventListener('pointerdown', onDown)
    base.addEventListener('pointermove', onMove)
    base.addEventListener('pointerup', onUp)
    base.addEventListener('pointercancel', onUp)
    return () => {
      base.removeEventListener('pointerdown', onDown)
      base.removeEventListener('pointermove', onMove)
      base.removeEventListener('pointerup', onUp)
      base.removeEventListener('pointercancel', onUp)
      reset()
    }
  }, [inputRef])

  return (
    <div ref={baseRef} className="joystick" aria-label="Movement joystick">
      <div ref={nubRef} className="joystick-nub" />
    </div>
  )
}
