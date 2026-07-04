// One-pass filter for public builds: removes every painting whose license is
// "copyrighted-personal-use-only" (in-copyright works included for local
// personal use), deletes their local images, prunes them from artists'
// paintingIds, and drops artists left with zero works.
//
// Usage:
//   node scripts/strip-restricted.mjs --dry-run   # report only
//   node scripts/strip-restricted.mjs             # apply
//
// Run BEFORE `npm run build` when producing a public/GitHub Pages deployment.
// (Re-running `npm run fetch-data` restores the full local collection.)

import { readFile, writeFile, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RESTRICTED = 'copyrighted-personal-use-only'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA = path.join(ROOT, 'public', 'data')
const dryRun = process.argv.includes('--dry-run')

const paintings = JSON.parse(await readFile(path.join(DATA, 'paintings.json'), 'utf8'))
const artists = JSON.parse(await readFile(path.join(DATA, 'artists.json'), 'utf8'))

const restricted = paintings.filter((p) => p.license === RESTRICTED)
const kept = paintings.filter((p) => p.license !== RESTRICTED)
const restrictedIds = new Set(restricted.map((p) => p.id))

const keptArtists = []
const droppedArtists = []
for (const artist of artists) {
  artist.paintingIds = artist.paintingIds.filter((id) => !restrictedIds.has(id))
  if (artist.paintingIds.length > 0) keptArtists.push(artist)
  else droppedArtists.push(artist)
}

console.log(`${dryRun ? '[dry run] ' : ''}Restricted paintings: ${restricted.length} of ${paintings.length}`)
for (const p of restricted) console.log(`  - ${p.title} (${p.artistId})`)
console.log(`Artists dropped entirely (no PD works remain): ${droppedArtists.map((a) => a.name).join(', ') || 'none'}`)

if (!dryRun) {
  for (const p of restricted) {
    const img = path.join(ROOT, 'public', p.image)
    if (existsSync(img)) await unlink(img)
  }
  for (const a of droppedArtists) {
    const img = path.join(ROOT, 'public', a.portrait ?? '')
    if (a.portrait && existsSync(img)) await unlink(img)
  }
  await writeFile(path.join(DATA, 'paintings.json'), JSON.stringify(kept, null, 2))
  await writeFile(path.join(DATA, 'artists.json'), JSON.stringify(keptArtists, null, 2))
  console.log(`\nWrote filtered data: ${kept.length} paintings, ${keptArtists.length} artists.`)
  console.log('Run `npm run fetch-data` to restore the full local collection.')
}
