import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useMuseum } from '../store'
import { asset } from '../data'

type Tab = 'periods' | 'artists'

export default function FilterBar() {
  const data = useMuseum((s) => s.data)!
  const filterPeriodId = useMuseum((s) => s.filterPeriodId)
  const setFilterPeriod = useMuseum((s) => s.setFilterPeriod)
  const requestFlyTo = useMuseum((s) => s.requestFlyTo)
  const openCard = useMuseum((s) => s.openCard)

  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('periods')
  const rootRef = useRef<HTMLDivElement>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  const [paneH, setPaneH] = useState<number | 'auto'>('auto')

  // animate panel height when the tab (content) swaps
  useLayoutEffect(() => {
    if (paneRef.current) setPaneH(paneRef.current.scrollHeight)
  }, [tab, open, filterPeriodId])

  // click-away close
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const activePeriod = filterPeriodId ? data.periodById.get(filterPeriodId) : null
  const artists = data.artists.filter((a) => !filterPeriodId || a.periodId === filterPeriodId)

  const pickPeriod = (id: string | null) => {
    setFilterPeriod(id)
    if (id) requestFlyTo('period', id)
    else requestFlyTo('home', '')
  }

  const pickArtist = (id: string) => {
    requestFlyTo('artist', id)
    setOpen(false)
    window.setTimeout(() => openCard(id), 900)
  }

  return (
    <div ref={rootRef} className={`filterbar${open ? ' is-open' : ''}`}>
      <button className="fb-pill" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="fb-pill-icon" style={{ background: activePeriod?.color ?? 'transparent' }} />
        <span className="fb-pill-label">{activePeriod ? activePeriod.name : 'All periods'}</span>
        <svg className="fb-chevron" width="10" height="6" viewBox="0 0 10 6">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>

      <div className="fb-panel" aria-hidden={!open}>
        <div className="fb-tabs" data-tab={tab}>
          <span className="fb-tab-thumb" />
          <button className={tab === 'periods' ? 'is-active' : ''} onClick={() => setTab('periods')}>
            Periods
          </button>
          <button className={tab === 'artists' ? 'is-active' : ''} onClick={() => setTab('artists')}>
            Artists
          </button>
        </div>

        <div className="fb-pane-clip" style={{ height: paneH }}>
          <div ref={paneRef} key={tab} className="fb-pane">
            {tab === 'periods' ? (
              <>
                <button
                  className={`fb-row${filterPeriodId == null ? ' is-current' : ''}`}
                  onClick={() => pickPeriod(null)}
                >
                  <span className="fb-dot fb-dot-all" />
                  <span className="fb-row-main">All periods</span>
                  <span className="fb-row-sub">
                    {data.periods[0].start} – {data.periods[data.periods.length - 1].end}
                  </span>
                </button>
                {data.periods.map((p) => (
                  <button
                    key={p.id}
                    className={`fb-row${filterPeriodId === p.id ? ' is-current' : ''}`}
                    onClick={() => pickPeriod(p.id)}
                  >
                    <span className="fb-dot" style={{ background: p.color }} />
                    <span className="fb-row-main">{p.name}</span>
                    <span className="fb-row-sub">
                      {p.start} – {p.end}
                    </span>
                  </button>
                ))}
              </>
            ) : (
              <>
                {artists.map((a) => {
                  const period = data.periodById.get(a.periodId)
                  return (
                    <button key={a.id} className="fb-row" onClick={() => pickArtist(a.id)}>
                      {a.portrait ? (
                        <img className="fb-thumb" src={asset(a.portrait)} alt="" />
                      ) : (
                        <span className="fb-thumb fb-thumb-empty">{a.name[0]}</span>
                      )}
                      <span className="fb-row-main">
                        {a.name}
                        <em style={{ color: period?.color }}>{period?.name}</em>
                      </span>
                      <span className="fb-row-sub">
                        {a.birthYear}–{a.deathYear}
                      </span>
                    </button>
                  )
                })}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
