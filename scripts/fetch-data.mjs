// Data pipeline: builds /public/data/*.json and downloads all images from
// Wikipedia + Wikimedia Commons. Every bio, story, fact, date, and image comes
// from the live APIs — nothing is generated locally.
//
// Hard rules enforced here:
//  - A painting is only included if its lead image is hosted on Wikimedia
//    Commons AND carries a public-domain / CC0 license in its metadata.
//  - Titles that don't resolve to a Wikipedia article fail loudly (warning +
//    exclusion), never silently substituted.
//
// Usage: npm run fetch-data

import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { periods, artists } from './museum-config.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = path.join(ROOT, 'public')
const UA = 'ArtHistoryMuseum/0.1 (local static site build; kiarashfa@gmail.com)'
const DELAY_MS = 60

const warnings = []
const warn = (msg) => {
  warnings.push(msg)
  console.warn(`  ! ${msg}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Global throttle: the wiki APIs 429 under sustained bursts, so keep a small
// minimum gap between every metadata request.
const API_GAP_MS = 120
let lastRequestAt = 0

async function getJson(url) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const wait = lastRequestAt + API_GAP_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastRequestAt = Date.now()
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (res.status === 404) return null
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('retry-after') ?? '0', 10)
        const backoff = Math.max(retryAfter * 1000, 8000 * attempt)
        if (attempt < 6) {
          console.log(`    (API 429, waiting ${backoff / 1000}s)`)
          await sleep(backoff)
          continue
        }
        throw new Error('HTTP 429')
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      if (attempt === 6) throw new Error(`${err.message} for ${url}`)
      await sleep(1500 * attempt)
    }
  }
}

function wikiApi(params) {
  const url = new URL('https://en.wikipedia.org/w/api.php')
  const all = { format: 'json', formatversion: '2', redirects: '1', ...params }
  for (const [k, v] of Object.entries(all)) url.searchParams.set(k, v)
  return getJson(url.toString())
}

function commonsApi(params) {
  const url = new URL('https://commons.wikimedia.org/w/api.php')
  const all = { format: 'json', formatversion: '2', ...params }
  for (const [k, v] of Object.entries(all)) url.searchParams.set(k, v)
  return getJson(url.toString())
}

async function wikidataClaims(qid) {
  const data = await getJson(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=claims&format=json`,
  )
  return data?.entities?.[qid]?.claims ?? {}
}

function claimYear(claims, prop) {
  const c = claims?.[prop]?.[0]?.mainsnak?.datavalue?.value
  if (!c?.time) return null
  const m = /^([+-]\d+)-/.exec(c.time)
  if (!m) return null
  return { year: parseInt(m[1], 10), precision: c.precision ?? 9 }
}

// One call per article: full lead text, lead image file name, wikidata QID.
async function fetchArticle(title) {
  const data = await wikiApi({
    action: 'query',
    titles: title,
    prop: 'extracts|pageimages|pageprops|info',
    exintro: '1',
    explaintext: '1',
    piprop: 'name',
    pilicense: 'any',
    ppprop: 'wikibase_item',
    inprop: 'url',
  })
  const page = data?.query?.pages?.[0]
  if (!page || page.missing) return null
  return {
    canonicalTitle: page.title,
    extract: (page.extract ?? '').trim(),
    imageName: page.pageimage ?? null,
    qid: page.pageprops?.wikibase_item ?? null,
    url: page.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
  }
}

// "No (known) restrictions" is the museum/Flickr-Commons release used for
// works with no surviving copyright (e.g. Brooklyn Museum) — treated as PD.
const PD_RE = /public domain|\bcc0\b|\bpd\b|pd-|no (?:known )?(?:copyright )?restrictions/i
// Free licenses acceptable for artist PORTRAIT photos (with credit recorded):
// CC BY / BY-SA, and museum/Flickr-Commons "no known restrictions" releases.
const FREE_CC_RE = /cc[ -]by(?:[ -]sa)?|no (?:known )?(?:copyright )?restrictions/i
const stripHtml = (s) => (s ?? '').replace(/<[^>]*>/g, '').trim()

async function imageInfoFrom(apiFn, fileName, thumbWidth) {
  const data = await apiFn({
    action: 'query',
    titles: `File:${fileName}`,
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: String(thumbWidth),
  })
  const page = data?.query?.pages?.[0]
  const info = page?.imageinfo?.[0]
  if (!page || page.missing || !info) return null
  const meta = info.extmetadata ?? {}
  return {
    downloadUrl: info.thumburl ?? info.url,
    width: info.width,
    height: info.height,
    licenseName: stripHtml(meta.LicenseShortName?.value),
    licenseUrl: meta.LicenseUrl?.value ?? '',
    artistMeta: stripHtml(meta.Artist?.value),
    creditMeta: stripHtml(meta.Credit?.value),
    filePageUrl: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName)}`,
  }
}

// License-gated Commons lookup. Returns null (with warning) unless the file is
// on Commons and clearly public-domain/CC0.
async function commonsImage(fileName, thumbWidth, context, { quiet = false } = {}) {
  const info = await imageInfoFrom(commonsApi, fileName, thumbWidth)
  if (!info) {
    if (!quiet) warn(`${context}: image "${fileName}" is not hosted on Wikimedia Commons — rejected`)
    return null
  }
  if (!PD_RE.test(info.licenseName) && !PD_RE.test(info.licenseUrl)) {
    if (!quiet) warn(`${context}: license "${info.licenseName || 'unknown'}" is not public domain — rejected`)
    return null
  }
  return {
    downloadUrl: info.downloadUrl,
    width: info.width,
    height: info.height,
    license: info.licenseName,
    commonsUrl: info.filePageUrl,
  }
}

// Fallback for artists whose work is still under copyright (config
// `allowNonFree: true`): use the en.wikipedia-hosted image (typically a
// deliberately low-resolution fair-use file) and mark the entry explicitly so
// the UI can flag it and public builds can strip it in one pass.
async function nonFreeImage(fileName, thumbWidth, context) {
  // en.wiki imageinfo also resolves Commons-hosted ("shared") files
  const info = await imageInfoFrom(wikiApi, fileName, thumbWidth)
  if (!info) {
    warn(`${context}: non-free image "${fileName}" not found on en.wikipedia — rejected`)
    return null
  }
  const holder = info.artistMeta || info.creditMeta || null
  return {
    downloadUrl: info.downloadUrl,
    width: info.width,
    height: info.height,
    license: 'copyrighted-personal-use-only',
    copyrightHolder: holder,
    commonsUrl: info.filePageUrl,
  }
}

// upload.wikimedia.org rate-limits aggressively: pace downloads, honor
// Retry-After, and skip files that already exist so re-runs are incremental.
const IMG_DELAY_MS = 1200

async function downloadImage(url, destAbs, context) {
  if (existsSync(destAbs)) return true
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('retry-after') ?? '0', 10)
        const wait = Math.max(retryAfter * 1000, 4000 * attempt)
        if (attempt < 5) {
          console.log(`    (429 on ${context}, waiting ${wait / 1000}s)`)
          await sleep(wait)
          continue
        }
        throw new Error('HTTP 429')
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const type = res.headers.get('content-type') ?? ''
      if (!type.startsWith('image/')) throw new Error(`unexpected content-type ${type}`)
      const buf = Buffer.from(await res.arrayBuffer())
      await mkdir(path.dirname(destAbs), { recursive: true })
      await writeFile(destAbs, buf)
      await sleep(IMG_DELAY_MS)
      return true
    } catch (err) {
      if (attempt === 5) {
        warn(`${context}: image download failed (${err.message})`)
        return false
      }
      await sleep(1500 * attempt)
    }
  }
}

// --- text helpers -----------------------------------------------------------

const ABBREVS = ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'St', 'Sr', 'Jr', 'c', 'ca', 'No', 'no', 'vol', 'Vol', 'pp', 'p', 'e.g', 'i.e', 'cm', 'Mt', 'Op', 'fl', 'approx']

const DOT_GUARD = ''

function splitSentences(text) {
  let guarded = text
  for (const a of ABBREVS) {
    guarded = guarded.replaceAll(`${a}.`, `${a}${DOT_GUARD}`)
  }
  return guarded
    .split(/(?<=[.!?])\s+(?=[A-Z"'“‘(])/)
    .map((s) => s.replaceAll(DOT_GUARD, '.').trim())
    .filter(Boolean)
}

function paragraphs(extract) {
  return extract
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^==/.test(p))
}

// Fun facts: verbatim sentences pulled from the lead's later paragraphs.
function extractFacts(extract, max = 3) {
  const paras = paragraphs(extract)
  const rest = paras.slice(1).join(' ')
  if (!rest) return []
  return splitSentences(rest)
    .filter((s) => s.length >= 60 && s.length <= 340)
    .slice(0, max)
}

function slugify(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60)
}

// "Bacchus (Caravaggio)" -> "Bacchus"; keeps titles without a disambiguator intact.
function displayTitle(wikiTitle) {
  return wikiTitle.replace(/\s+\([^)]*\)\s*$/, '')
}

function firstYearInText(text) {
  const m = /\b(1[3-9]\d{2})\b/.exec(text)
  return m ? parseInt(m[1], 10) : null
}

function yearText(yearInfo, fallbackYear) {
  if (yearInfo) {
    if (yearInfo.precision <= 8) return `${Math.floor(yearInfo.year / 10) * 10}s`
    return String(yearInfo.year)
  }
  return fallbackYear ? `c. ${fallbackYear}` : ''
}

// --- pipeline ----------------------------------------------------------------

async function buildPeriods() {
  const out = []
  for (const p of periods) {
    console.log(`Period: ${p.name}`)
    const article = await fetchArticle(p.wikiTitle)
    if (!article) {
      warn(`Period article "${p.wikiTitle}" not found`)
      continue
    }
    const paras = paragraphs(article.extract)
    out.push({
      id: p.id,
      name: p.name,
      start: p.start,
      end: p.end,
      color: p.color,
      blurb: paras[0] ?? '',
      wikipediaUrl: article.url,
    })
    await sleep(DELAY_MS)
  }
  return out
}

async function buildArtist(cfg) {
  console.log(`Artist: ${cfg.wikiTitle}`)
  const article = await fetchArticle(cfg.wikiTitle)
  if (!article) throw new Error(`Artist article "${cfg.wikiTitle}" not found`)

  let birthYear = null
  let deathYear = null
  if (article.qid) {
    const claims = await wikidataClaims(article.qid)
    birthYear = claimYear(claims, 'P569')?.year ?? null
    deathYear = claimYear(claims, 'P570')?.year ?? null
  }
  // Short role line ("Italian Renaissance polymath") from the REST summary.
  const summary = await getJson(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(article.canonicalTitle)}`,
  )
  const description = summary?.description ?? ''

  // Portrait: config override or article lead image. PD/CC0 preferred; free CC
  // licenses (BY / BY-SA) are also accepted for portrait photos, with the
  // license + credit recorded for attribution. Fair-use-only portraits are
  // skipped (the UI falls back to an initial).
  let portrait = null
  let portraitAspect = null
  let portraitLicense = null
  let portraitCredit = null
  const portraitName = cfg.portraitFile ?? article.imageName
  if (portraitName) {
    const info = await imageInfoFrom(commonsApi, portraitName, 512)
    const free =
      info && (PD_RE.test(info.licenseName) || PD_RE.test(info.licenseUrl) || FREE_CC_RE.test(info.licenseName))
    if (free) {
      const rel = `images/artists/${cfg.id}.jpg`
      if (await downloadImage(info.downloadUrl, path.join(PUBLIC, rel), `${cfg.wikiTitle} portrait`)) {
        portrait = rel
        portraitAspect = info.width / info.height
        portraitLicense = info.licenseName
        portraitCredit = FREE_CC_RE.test(info.licenseName) ? info.artistMeta || info.creditMeta || null : null
      }
    }
  }
  if (!portrait) warn(`${cfg.wikiTitle}: no freely-licensed portrait — using initial fallback`)

  const paras = paragraphs(article.extract)
  return {
    id: cfg.id,
    periodId: cfg.periodId,
    name: article.canonicalTitle,
    description,
    birthYear,
    deathYear,
    bio: paras.slice(0, 2).join('\n\n'),
    portrait,
    portraitAspect,
    portraitLicense,
    portraitCredit,
    wikipediaUrl: article.url,
    paintingIds: [],
  }
}

// Gallery room size tier. Kept in sync with src/gallery/layout.ts tierForCount.
// PERMANENT once assigned: a curated `tier` in museum-config wins; only brand-new
// artists (no explicit tier) fall back to deriving it from their painting count,
// so re-running this after a manual painting addition never re-tiers an artist.
const tierForCount = (c) => (c >= 15 ? 'large' : c >= 8 ? 'medium' : 'small')

const usedPaintingIds = new Set()

// A painting config entry is either an article title string, or
// { title, imageFile } to force a specific Commons file when the article's
// lead image is a non-PD re-photograph of a PD work.
async function buildPainting(entry, artistId, artistName, allowNonFree) {
  const title = typeof entry === 'string' ? entry : entry.title
  const imageOverride = typeof entry === 'string' ? null : (entry.imageFile ?? null)
  const article = await fetchArticle(title)
  const context = `${artistName} — "${title}"`
  if (!article) {
    warn(`${context}: article not found`)
    return null
  }
  const imageName = imageOverride ?? article.imageName
  if (!imageName) {
    warn(`${context}: article has no lead image`)
    return null
  }
  // Commons + public domain first; for flagged artists fall back to the
  // en.wiki fair-use file, marked copyrighted-personal-use-only.
  let img = await commonsImage(imageName, 1600, context, { quiet: allowNonFree })
  if (!img && allowNonFree) {
    img = await nonFreeImage(imageName, 1600, context)
    if (img) console.log(`    (restricted) ${context}`)
  }
  if (!img) return null

  // display-title slug first; if another version of the same subject already
  // took it (e.g. two Judith Slaying Holofernes), disambiguate with the full title
  let id = `${artistId}--${slugify(displayTitle(article.canonicalTitle))}`
  if (usedPaintingIds.has(id)) id = `${artistId}--${slugify(article.canonicalTitle)}`
  usedPaintingIds.add(id)
  const rel = `images/paintings/${id}.jpg`
  if (!(await downloadImage(img.downloadUrl, path.join(PUBLIC, rel), context))) return null

  let yearInfo = null
  if (article.qid) {
    const claims = await wikidataClaims(article.qid)
    yearInfo = claimYear(claims, 'P571')
  }
  const fallbackYear = firstYearInText(article.extract)
  const year = yearInfo?.year ?? fallbackYear

  const paras = paragraphs(article.extract)
  return {
    id,
    artistId,
    title: displayTitle(article.canonicalTitle),
    wikiTitle: article.canonicalTitle,
    year,
    yearText: yearText(yearInfo, fallbackYear),
    story: paras[0] ?? '',
    facts: extractFacts(article.extract),
    image: rel,
    aspect: img.width / img.height,
    license: img.license,
    copyrightHolder: img.copyrightHolder ?? null,
    wikipediaUrl: article.url,
    commonsUrl: img.commonsUrl,
  }
}

async function main() {
  await mkdir(path.join(PUBLIC, 'data'), { recursive: true })

  const periodsOut = await buildPeriods()

  const artistsOut = []
  const paintingsOut = []
  for (const cfg of artists) {
    const artist = await buildArtist(cfg)
    for (const title of cfg.paintings) {
      const painting = await buildPainting(title, cfg.id, artist.name, cfg.allowNonFree === true)
      if (painting) {
        paintingsOut.push(painting)
        artist.paintingIds.push(painting.id)
      }
      await sleep(DELAY_MS)
    }
    if (artist.paintingIds.length < 4) {
      warn(`${artist.name}: only ${artist.paintingIds.length} paintings survived the license gate (want 4+)`)
    }
    artist.tier = cfg.tier ?? tierForCount(artist.paintingIds.length)
    artistsOut.push(artist)
  }

  await writeFile(path.join(PUBLIC, 'data', 'periods.json'), JSON.stringify(periodsOut, null, 2))
  await writeFile(path.join(PUBLIC, 'data', 'artists.json'), JSON.stringify(artistsOut, null, 2))
  await writeFile(path.join(PUBLIC, 'data', 'paintings.json'), JSON.stringify(paintingsOut, null, 2))

  console.log(`\nDone: ${periodsOut.length} periods, ${artistsOut.length} artists, ${paintingsOut.length} paintings.`)
  if (warnings.length) {
    console.log(`\n${warnings.length} warnings:`)
    for (const w of warnings) console.log(`  - ${w}`)
    await writeFile(path.join(ROOT, 'scripts', 'fetch-report.txt'), warnings.join('\n'))
  }
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
