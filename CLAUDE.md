# GR Tours & Travels website

One-page website for **GR Tours & Travels**, a taxi and tourist vehicle service based in **Murdeshwar, Bhatkal Taluk, Uttara Kannada, Karnataka**.
Tagline: **"Safe journey, happy memories."**

## How the project is built

Each section is its own small page in `sections/<name>/index.html` with its images in `sections/<name>/img/`.
`build.py` joins them into one website in `site/` (`site/index.html` + `site/assets/`).
It scopes every section's CSS, ids and animations so sections never clash. **Do not hand-edit `site/`; edit the section, then run:**

```
pip install tinycss2
python build.py
```

Then open **`site/index.html`** (for example with VS Code Live Server). That is the full website. A single `sections/<name>/index.html` also opens on its own, but only for previewing that one section. To publish, upload the whole `site/` folder (for example drag it onto app.netlify.com/drop).

## Section order (fixed)

1. `hero`: train-window scene, glass top bar (logo, pill nav, Book Now), "Escape to the Coast", glass WhatsApp bar
2. `coastal-route`: pinned scroll story. The driver stands by the empty van → the family boards → the engine starts → the van stays on the left while the route line slides under it: Mangaluru → Udupi → Kundapura → Murdeshwar → Honnavar → Kumta → Gokarna → Sirsi. At each stop a small glass title card and that place's 3D island pop up; a place stays until the van is halfway to the next stop. On phones the island is sized to fit between the card and the van.
3. `services`: six static glass cards (airport, outstation, family/group, tour packages, scuba at Netrani, "Rooms wherever we go")
4. `tour-plans`: pinned one-card swap (desktop and phone): Murdeshwar Darshan · Uttara Kannada Falls · Full Karavali Coast · Make your own, with glass tabs, a Day 1/Day 2 switch, a travellers counter and a custom trip builder
5. `vehicles`: 5 / 7 / 11-seater glass cards + a "How many people?" counter that highlights the best fit
6. `footer`: "Ready for your coastal escape?" band, navy footer (links, services, contact), floating "Chat with us" WhatsApp button

**The sections above are approved and locked. Do not redesign them.** Only change what the owner asks for, and keep everything else exactly as it is.

## Rules the owner set

- **No personal names** anywhere on the site or in WhatsApp messages. Use only "GR Tours & Travels".
- WhatsApp / call: **96209 36143** (`919620936143` in wa.me links). Second call number: **91418 57173**.
- WhatsApp buttons open WhatsApp **directly** with a ready message. No popups or confirm steps.
- Prices are **"Price on WhatsApp"** until the owner gives real fares. Don't invent prices, hotel names or claims.
- Every vehicle image carries the **GR Tours & Travels** logo on its side panel (navy G, red R, "TOURS & TRAVELS").
- Never mention or show any AI-tool watermark or logo. If a new image has one, clean it out quietly before using it.
- All new 3D images use the same style as the existing islands: Pixar-inspired 3D, a round floating diorama island with layered brown soil, on a plain white background (background removed before use).

## Look and feel

- Light, clean **liquid-glass** UI: frosted panels (`backdrop-filter: blur(...) saturate(...)`), a gradient rim via a masked `::before`, a soft top shine, pill buttons.
- The primary button is navy glass with a glossy green WhatsApp bubble. Secondary chips, tabs and switches are clear glass, and the selected state is light-blue glass with a sliding knob.
- Font: **Inter** (plus Noto Sans Kannada for Kannada place names). Text navy `#0B1F44`, accent red `#D52A33`, page background `#EEF4FB` with soft blue, gold and sea-green glows so the glass has colour to blur.
- Must work at phone width (about 360–400px) with no horizontal scroll and nothing overlapping. Check phone and desktop after every change.
