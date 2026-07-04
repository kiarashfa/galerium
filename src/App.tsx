import { Suspense, lazy, useEffect } from 'react'
import { useMuseum } from './store'
import { loadMuseumData } from './data'
import Timeline from './timeline/Timeline'
import FilterBar from './timeline/FilterBar'
import ArtistCard from './timeline/ArtistCard'
import AboutModal from './timeline/AboutModal'

const GalleryApp = lazy(() => import('./gallery/GalleryApp'))

export default function App() {
  const data = useMuseum((s) => s.data)
  const view = useMuseum((s) => s.view)
  const setData = useMuseum((s) => s.setData)

  useEffect(() => {
    loadMuseumData().then(setData).catch((err) => {
      console.error(err)
      document.body.innerHTML = `<pre style="color:#c66;padding:2rem">Failed to load museum data.\nRun: npm run fetch-data\n\n${err}</pre>`
    })
  }, [setData])

  if (!data) {
    return (
      <div className="boot-veil">
        <div className="boot-title">Museum of Art History</div>
        <div className="boot-sub">Preparing the collection…</div>
      </div>
    )
  }

  const inGallery = view === 'entering' || view === 'gallery'

  return (
    <>
      {!inGallery && (
        <div className="timeline-screen">
          <Timeline />
          <FilterBar />
          <ArtistCard />
          <AboutModal />
          <header className="masthead">
            <div className="masthead-title">Museum of Art History</div>
            <div className="masthead-sub">An interactive timeline · Medieval to Contemporary</div>
          </header>
          <button className="about-btn" onClick={() => useMuseum.getState().setAbout(true)}>
            About
          </button>
        </div>
      )}
      {inGallery && (
        <Suspense fallback={<div className="boot-veil"><div className="boot-title">Entering the gallery…</div></div>}>
          <GalleryApp />
        </Suspense>
      )}
    </>
  )
}
