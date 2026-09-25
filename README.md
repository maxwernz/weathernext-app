# Skycast: a WeatherNext 3 weather app

A clean, installable weather app for desktop and iPhone, powered by
[Google DeepMind's WeatherNext 3](https://developers.google.com/weathernext/guides/models)
ensemble forecasts.

**Live:** https://maxwernz.github.io/weathernext-app/

- The current conditions and hourly forecast use the newest hourly WeatherNext 3 run (48 h horizon).
- The 15-day outlook uses the newest 6-hourly run (00/06/12/18 UTC).
- The ensemble spread shows how uncertain the forecast is: a p10–p90 temperature band, a rain chance estimated from the precipitation quantiles, and a confidence rating.
- There are two looks in Settings: **Sky** (glass cards on a sky that follows the weather) and **Clean** (minimal, in the style of AccuWeather, with light, dark or automatic themes).
- Tap any day or hour to open a **day detail view**. It lets you switch days, shows charts for temperature, precipitation, wind, humidity, clouds, pressure and sun with written summaries, gives key figures for the day, and has an hour-by-hour table.
- It works as an installable PWA: in iPhone Safari, tap **Share → Add to Home Screen**.
- It runs as a static site with no server and no secrets. Your browser signs in with your own
  Google account and queries Earth Engine directly, so WeatherNext data is never
  redistributed.
- Until WeatherNext is connected, the app shows clearly labelled **demo data** from Open-Meteo.

## How it works

```
Browser ──OAuth (redirect)──▶ Google sign-in
   │
   └──Earth Engine JS API──▶ projects/gcp-public-data-weathernext/assets/weathernext_3_0_0_0p1deg
                               (one request: find the newest runs + sample the point)
```

| File | Purpose |
|---|---|
| `js/providers/weathernext.js` | Earth Engine query, band mapping, run stitching |
| `js/providers/openmeteo.js` | Demo data provider |
| `js/weather.js` | Conditions, humidity, feels-like, sun position, daily aggregation |
| `js/auth.js` | Browser OAuth token flow (redirect based, works in iOS home-screen apps) |
| `js/chart.js` | SVG temperature/precipitation chart with ensemble band |
| `js/app.js` | UI and state |

There is no build step: plain ES modules served as static files.

## Setup

WeatherNext data is not public. You need an allowlisted Google account and a
Cloud project that can call Earth Engine.

1. **Request data access.** Submit the
   [WeatherNext Data Request form](https://docs.google.com/forms/d/e/1FAIpQLSeCf1JY8G78UDWzbm0ly9kJxfSjUIJT5WyMR_HiNqCm-IHIBg/viewform)
   with your Google account. Approval takes about 5–7 business days.
2. **Create a Cloud project** at https://console.cloud.google.com/projectcreate.
3. **Register the project for Earth Engine** at https://code.earthengine.google.com/register
   (noncommercial/academic use is free). Then enable the
   [Earth Engine API](https://console.cloud.google.com/apis/library/earthengine.googleapis.com)
   in the project.
4. **Configure the OAuth consent screen** (APIs & Services → OAuth consent screen):
   - User type: *External*. Publishing status: *Testing*.
   - Add your own Google account under *Test users*.
5. **Create an OAuth client ID** (APIs & Services → Credentials → Create credentials → OAuth client ID):
   - Application type: *Web application*
   - Authorized JavaScript origins: `https://maxwernz.github.io` and `http://localhost:8765`
   - Authorized redirect URIs: `https://maxwernz.github.io/weathernext-app/` and `http://localhost:8765/`
     (the trailing slash matters)
6. **Open the app → Settings.** Paste the client ID and the project ID, then tap
   **Sign in with Google**.

To preconfigure every device, put the client ID and project ID into
`js/config.js` and push. Both values identify the app and are not secrets.

The sign-in lasts about 1 hour. After that the app renews it silently with a
quick redirect when you open it.

## Run locally

```sh
python3 -m http.server 8765
# open http://localhost:8765/
```

## Data & attribution

Forecast data: Google DeepMind WeatherNext 3. This experimental data is not intended,
validated or approved for real-world use. Real-time data (less than 1 hour old) is governed by the
*GDM Real-Time Weather Forecasting Experimental Data Terms of Use*. Historical data is
licensed under CC BY 4.0. © 2026 DeepMind Technologies Limited.

Place search: [Open-Meteo Geocoding](https://open-meteo.com/). Demo forecasts: Open-Meteo (CC BY 4.0).
Reverse geocoding: BigDataCloud.
