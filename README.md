# Galerium

**Galerium** (gallery + museum) is an interactive museum of art history that runs entirely in your browser. It opens on a zoomable, night-sky timeline where art movements float like constellations — zoom into a period and its artists appear, positioned by the years they actually worked. Pick an artist, read their placard, and step through the doors into their own first-person 3D gallery, hung with their real paintings.

Every biography, date, story, and image comes from [Wikipedia](https://en.wikipedia.org) and [Wikimedia Commons](https://commons.wikimedia.org). Nothing is invented: if it isn't on Wikipedia, it isn't in Galerium.

## What's inside

- **Fifteen periods** of Western painting — Medieval & Gothic, Renaissance, Baroque, Rococo, Neoclassicism, Romanticism, Realism, Impressionism, Post-Impressionism, Expressionism, Cubism, Surrealism, Abstract Expressionism, Pop Art, and Contemporary — with more than seventy artists, from Giotto to Basquiat, and the collection still growing.
- **A walkable 3D gallery for every artist**, built in real-time WebGL: physically-based materials, an individual spotlight above each canvas, gilded frames, reflective wood floors, and museum wall labels.
- **A close-up view for every painting** — click or tap a canvas and the camera glides up to it, opening a high-resolution inspect view with the painting's story, its date, and facts from the record.
- **Works on desktop and on your phone.** WASD + mouse-look at a desk; a virtual joystick, drag-to-look, and pinch-to-zoom on touch screens. The control scheme switches automatically.
- **Completely static.** No backend, no database, no accounts — just files. Built with React and Three.js on data fetched from the Wikimedia public APIs.

## Visit

**➜ [Enter the museum](PASTE-DEPLOYED-URL-HERE)**

1. **Zoom** the timeline (scroll or pinch) — periods dissolve into their artists.
2. **Click an artist** to read their placard, then hit **Enter Gallery**.
3. **Walk** with WASD or the joystick; look around with the mouse or a drag.
4. **Click a painting** to step up close and read its story.

Or run it locally:

```bash
npm install
npm run dev
```

## Data & credits

Galerium is built on the shoulders of two extraordinary projects: **[Wikipedia](https://en.wikipedia.org)**, which provides every artist biography, painting story, and date, and **[Wikimedia Commons](https://commons.wikimedia.org)**, which hosts the artwork images and artist portraits. If you find Galerium delightful, consider [donating to the Wikimedia Foundation](https://donate.wikimedia.org) — they keep the world's art history free for everyone.

Admission is free, the doors never close, and there are no velvet ropes — walk right up to the Rembrandts.

---

All artwork data and images come from Wikipedia and Wikimedia Commons. Galerium is a personal, educational project — not affiliated with any museum, artist estate, or rights holder. © 2026 Kiarash Farajzadehahary

Made with ❤️ for people who read every placard.
