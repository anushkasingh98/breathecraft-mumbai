# BreatheCraft Mumbai

A Minecraft-style web game for exploring Mumbai's air quality from **1 Feb 2025 to today**. Pick a character, walk around a pixelated map of the real city, and watch the AQI, haze, mask and lung "oxygen tank" change as you scrub through dates and hours or tweak the factors that drive pollution.

## Running it

Open `index.html` in a browser. There is no build step and no server.

- An internet connection is needed for the map tiles (Esri World Street Map) and the pixel fonts (Google Fonts). Without one, the AQI logic and panels still work, but the map area stays blank.
- Desktop only; there are no touch controls.

### Demo shortcuts (URL parameters)

| Parameter | Meaning | Example |
|---|---|---|
| `char` | Skip the select screen: `0` Sandhya, `1` Anushka, `2` Himank, `3` Dheeraj | `?char=1` |
| `day` | Day index, counted from 1 Feb 2025 (= day 0) | `&day=645` (8 Nov 2026, Diwali) |
| `hour` | Hour of day, 0–23 | `&hour=22` |
| `zoom` | Map zoom, 11 (whole city) to 18 (street) | `&zoom=12` |

Example: `index.html?char=2&day=645&hour=22&zoom=12` opens Diwali night across the whole city as Himank.

## Controls

| Input | Action |
|---|---|
| WASD / arrow keys | Move (Shift to sprint) |
| Mouse wheel, `+` / `−` buttons or keys | Zoom in / out |
| ▦ button | Cycle pixel size (blocky → chunkier → sharp) |
| Date timeline (bottom) | Drag to pick a date, ▶ PLAY for a day-by-day time-lapse. `[` and `]` step a day. |
| Time rail (right) | Drag to pick the hour. `Q` and `E` step an hour. |
| ⚙ AQI FACTORS (top right) | Sliders and −/+ buttons for the what-if scenario |

## Screen layout

- **Top left (HUD):** nearest neighbourhood, current AQI and CPCB category, recorded value, and nearest real sensor. It flags hours with no reading as "estimated".
- **Left (character panel):** close-up portrait with the mask for the current AQI, an oxygen-tank gauge (clean air left for the lungs), the equivalent cigarettes per day, and advice.
- **Map:** the player, plus 18 AQI signposts (📡 = real sensor). When zoomed out, the signposts shrink to coloured AQI numbers. Haze, smog particles, rain, night darkness and a red vignette at Severe all follow the current AQI and factors.
- **Bottom left:** Predicted AQI for the current slider values, and its difference from the recorded value.
- **Bottom:** date timeline coloured by daily city AQI, with 🎆 markers on each Diwali.

## Characters and masks

| Character | Sensitivity |
|---|---|
| Sandhya (woman), Marine Drive jogger | Sensitive: heavy breathing, so each mask kicks in 50 AQI earlier |
| Anushka (girl), school girl | Sensitive: each mask kicks in 50 AQI earlier |
| Himank (boy), school boy | Sensitive: each mask kicks in 50 AQI earlier |
| Dheeraj (man), local-train commuter | Standard |

Mask tiers use AQI + sensitivity offset:

| Effective AQI | Mask |
|---|---|
| 0–100 | None |
| 101–200 | Cloth / surgical |
| 201–300 | N95 |
| 301+ | Gas mask (respirator) |

**Oxygen tank:** `1 − AQI / 500`. This is an illustration, not a medical measure.
**Cigarettes/day:** PM2.5 ÷ 22 µg/m³. This uses the Berkeley Earth rule of thumb that 22 µg/m³ of PM2.5 over a day is about one cigarette.

## Data

All data is baked into `data.js` by `tools/bake.js` from files already in this repo:

| Source | Used for |
|---|---|
| `../Data/Train.csv` | Hourly PM2.5 at 4 OpenAQ stations: Borivali East, Malad West, Shivaji Nagar, Byculla |
| `../Data/Stations.csv` | Station names and coordinates |
| `../Data/OtherData/openmeteo_daily.csv` | Daily temperature (mean/min/max), rainfall and wind speed from Open-Meteo |

Processing:

- **Timestamps:** the station files mark the *end* of each hour, so the bake script shifts every reading back one hour.
- **Bad readings:** glitch rows (`flag_high_1000` or > 1,000 µg/m³) are dropped.
- **Gap filling:** gaps are filled with the station's median for that month and hour. This covers 1–18 Feb 2025 (before the data starts) and everything after the last training row, 10 Nov 2026. These hours are flagged as estimated in the UI.
- **AQI:** India's CPCB PM2.5 sub-index, applied to a 50/50 blend of the hourly value and its trailing 24-hour mean. CPCB officially uses 24-hour means; the blend keeps some hour-to-hour variation for the time slider.
- **Map points:** the AQI anywhere on the map, including the 14 non-sensor neighbourhoods, is an inverse-distance-weighted average of the 4 stations.

To refresh after new data arrives (for example a newer `Train.csv` or a refetched weather cache):

```
node game/tools/bake.js      # run from the AQI_Hackathon folder
```

## Factors and the predictor

When you pick a date and hour, the sliders are set to that moment's conditions:

| Factor | Default comes from |
|---|---|
| Temperature | Daily min/max shaped into a curve that peaks around 15:00 |
| Rainfall | Daily total (mm/day) |
| Wind speed | Daily mean, varied through the day |
| Humidity | Monthly Mumbai typical values; there is no real data in the repo |
| Traffic density | Rush-hour curve with peaks around 09:30 and 19:00, lower on Sundays (a proxy) |
| Construction | Monthly index that is low in the monsoon (Jun–Sep) (a proxy) |
| Firecrackers | On for evenings (18:00+) from the day before to the day after Diwali |

**Predicted AQI** = recorded AQI with its PM2.5 scaled by `exp(Σ coef × (slider − default))`. With untouched sliders it equals the recorded AQI. Coefficients (`COEF` in `js/aqi.js`):

| Factor | Effect | Origin |
|---|---|---|
| Firecrackers | ×1.58 PM2.5 | **Fitted** on 13,153 station-hours (`tools/bake.js`) |
| Rainfall | −0.25 per log(1 + mm/day) | Set by hand |
| Wind speed | −0.03 per km/h | Set by hand |
| Temperature | −0.03 per °C (cooler air traps pollution) | Set by hand |
| Humidity | +0.004 per % | Set by hand |
| Traffic | +0.006 per point | Set by hand |
| Construction | +0.005 per point | Set by hand |

Why not fit everything: `bake.js` fits a least-squares model of log PM2.5 on weather, traffic, firecrackers and season (R² 0.59). The weather terms come out with the wrong signs, because rainy and hot months are also the clean months and the seasonal terms absorb the effect. Only the firecracker effect is kept from the fit. The other values are physically sensible elasticities chosen for a teaching tool. Treat the Predicted AQI as a scenario, not a forecast.

## Code layout

```
game/
  index.html        page structure (HUD, panels, select screen)
  style.css         Minecraft-style panels and layout
  data.js           generated by tools/bake.js (do not edit by hand)
  js/aqi.js         CPCB conversion, station AQI, factor defaults, predictor, daily city AQI
  js/map.js         Esri tile loading and pixelated drawing (Web Mercator), neighbourhoods, IDW AQI
  js/sprites.js     characters, 8×16 map sprite, 32×36 portrait with masks, oxygen tank
  js/main.js        game state, input, rendering loop, all UI wiring
  tools/bake.js     data pipeline + model fit (Node, no dependencies)
```

Scripts are plain `<script>` tags that share globals, loaded in the order above. This is why `file://` works with no bundler.

Things to change most often:

- **Neighbourhoods / signposts:** `ZONES` in `js/map.js`, as lat/lon pairs.
- **Characters:** `CHARACTERS` in `js/sprites.js`. `sens` is the mask offset; `extra` is `tie`, `bag` or `band`; `longHair`, `bindi`, `clip` and `mustache` toggle face details.
- **Mask names and advice:** `MASKS` in `js/sprites.js`. Thresholds are in `maskTier()`.
- **Predictor strengths:** `COEF` in `js/aqi.js`.
- **Map style:** `TILE_URL` in `js/map.js`. The tiles must be in Web Mercator `{z}/{x}/{y}` form. Note that CARTO now requires an API key.

## Known limitations

- There is no water collision on the real map. Movement is only clamped to the Mumbai bounding box.
- Only 4 real sensors exist, so everything else on the map is interpolated from them. South Mumbai (Colaba, Fort) effectively reads Byculla.
- Humidity, traffic and construction are proxies, not measurements.
- Esri tiles are used under their free, non-commercial terms, with attribution shown on screen.
