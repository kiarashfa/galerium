import { create } from 'zustand'
import type { MuseumData } from './types'

export type View = 'timeline' | 'entering' | 'gallery'

interface MuseumStore {
  data: MuseumData | null
  view: View
  /** Artist whose placard card is open on the timeline. */
  cardArtistId: string | null
  /** Artist whose 3D gallery we are in (or entering). */
  galleryArtistId: string | null
  /** Painting currently in the inspect lightbox. */
  inspectPaintingId: string | null
  filterPeriodId: string | null
  aboutOpen: boolean
  /** One-shot camera request consumed by the timeline (nonce forces re-fire). */
  flyToTarget: { kind: 'period' | 'artist' | 'home'; id: string; nonce: number } | null

  setData: (d: MuseumData) => void
  openCard: (artistId: string | null) => void
  requestFlyTo: (kind: 'period' | 'artist' | 'home', id: string) => void
  enterGallery: (artistId: string) => void
  galleryReady: () => void
  exitGallery: () => void
  inspect: (paintingId: string | null) => void
  setFilterPeriod: (periodId: string | null) => void
  setAbout: (open: boolean) => void
}

export const useMuseum = create<MuseumStore>((set) => ({
  data: null,
  view: 'timeline',
  cardArtistId: null,
  galleryArtistId: null,
  inspectPaintingId: null,
  filterPeriodId: null,
  aboutOpen: false,
  flyToTarget: null,

  setData: (data) => set({ data }),
  openCard: (cardArtistId) => set({ cardArtistId }),
  requestFlyTo: (kind, id) => set({ flyToTarget: { kind, id, nonce: Date.now() + Math.random() } }),
  enterGallery: (artistId) =>
    set({ view: 'entering', galleryArtistId: artistId, cardArtistId: null, inspectPaintingId: null }),
  galleryReady: () => set({ view: 'gallery' }),
  exitGallery: () => set({ view: 'timeline', galleryArtistId: null, inspectPaintingId: null }),
  inspect: (inspectPaintingId) => set({ inspectPaintingId }),
  setFilterPeriod: (filterPeriodId) => set({ filterPeriodId }),
  setAbout: (aboutOpen) => set({ aboutOpen }),
}))

// exposed for automated tests / debugging
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__museumStore = useMuseum
}
