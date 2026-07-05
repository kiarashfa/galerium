export interface Period {
  id: string
  name: string
  start: number
  end: number
  color: string
  blurb: string
  wikipediaUrl: string
}

/** Gallery room size tier, assigned once from painting count and stored as
 *  permanent data (does NOT re-derive live — see scripts/museum-config.mjs). */
export type RoomTier = 'small' | 'medium' | 'large'

export interface Artist {
  id: string
  periodId: string
  name: string
  description: string
  birthYear: number | null
  deathYear: number | null
  bio: string
  portrait: string | null
  portraitAspect: number | null
  portraitLicense: string | null
  portraitCredit: string | null
  wikipediaUrl: string
  paintingIds: string[]
  /** Permanent gallery room size; see RoomTier. */
  tier: RoomTier
}

/** Marker license for works still under copyright, included for local personal
 *  use only. Public builds can strip these in one pass (scripts/strip-restricted.mjs). */
export const RESTRICTED_LICENSE = 'copyrighted-personal-use-only'

export interface Painting {
  id: string
  artistId: string
  title: string
  wikiTitle: string
  year: number | null
  yearText: string
  story: string
  facts: string[]
  image: string
  aspect: number
  license: string
  copyrightHolder: string | null
  wikipediaUrl: string
  commonsUrl: string
}

export const isRestricted = (p: Painting) => p.license === RESTRICTED_LICENSE

export interface MuseumData {
  periods: Period[]
  artists: Artist[]
  paintings: Painting[]
  artistById: Map<string, Artist>
  paintingById: Map<string, Painting>
  periodById: Map<string, Period>
}
