import { useEffect } from 'react'
import { useMuseum } from '../store'
import { asset } from '../data'

export default function ArtistCard() {
  const data = useMuseum((s) => s.data)!
  const cardArtistId = useMuseum((s) => s.cardArtistId)
  const openCard = useMuseum((s) => s.openCard)
  const enterGallery = useMuseum((s) => s.enterGallery)

  const artist = cardArtistId ? data.artistById.get(cardArtistId) : null

  useEffect(() => {
    if (!artist) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') openCard(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [artist, openCard])

  if (!artist) return null
  const period = data.periodById.get(artist.periodId)
  const works = artist.paintingIds.length

  return (
    <div className="card-scrim" onClick={() => openCard(null)}>
      <article className="placard" onClick={(e) => e.stopPropagation()}>
        <button className="placard-close" onClick={() => openCard(null)} aria-label="Close">
          ×
        </button>

        <div className="placard-portrait">
          {artist.portrait ? (
            <img src={asset(artist.portrait)} alt={`Portrait of ${artist.name}`} />
          ) : (
            <div className="placard-portrait-empty">{artist.name[0]}</div>
          )}
        </div>

        <div className="placard-period" style={{ color: period?.color }}>
          {period?.name}
        </div>
        <h2 className="placard-name">{artist.name}</h2>
        <div className="placard-dates">
          {artist.birthYear} — {artist.deathYear}
        </div>
        {artist.description && (
          <div className="placard-role">
            {/* drop a trailing (1606–1669)-style range — the dates line already shows it */}
            {artist.description.replace(/\s*\(\s*\d{3,4}[\s–—-]+\d{3,4}\s*\)\s*$/, '')}
          </div>
        )}

        <div className="placard-rule" />

        <p className="placard-bio">{artist.bio.split('\n')[0]}</p>

        <div className="placard-foot">
          <button className="placard-enter" onClick={() => enterGallery(artist.id)}>
            Enter Gallery
            <span className="placard-enter-arrow">→</span>
          </button>
          <div className="placard-meta">
            <span>
              {works} work{works === 1 ? '' : 's'} in the collection
            </span>
            <a href={artist.wikipediaUrl} target="_blank" rel="noreferrer">
              Wikipedia ↗
            </a>
          </div>
          {artist.portraitCredit && (
            <div className="placard-credit">
              Portrait: {artist.portraitCredit} ({artist.portraitLicense})
            </div>
          )}
        </div>
      </article>
    </div>
  )
}
