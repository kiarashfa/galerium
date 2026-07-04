import type { MuseumData, Period, Artist, Painting } from './types'

export const asset = (rel: string) => `${import.meta.env.BASE_URL}${rel}`

export async function loadMuseumData(): Promise<MuseumData> {
  const [periods, artists, paintings] = (await Promise.all(
    ['periods', 'artists', 'paintings'].map(async (name) => {
      const res = await fetch(asset(`data/${name}.json`))
      if (!res.ok) throw new Error(`Failed to load ${name}.json (${res.status})`)
      return res.json()
    }),
  )) as [Period[], Artist[], Painting[]]

  return {
    periods,
    artists,
    paintings,
    artistById: new Map(artists.map((a) => [a.id, a])),
    paintingById: new Map(paintings.map((p) => [p.id, p])),
    periodById: new Map(periods.map((p) => [p.id, p])),
  }
}
