# Health Data

Upload an Apple Health export zip (iPhone: Health app → profile picture → **Export All Health Data**) and explore your activity, heart, sleep, and workout history in ARI.

## Privacy: 1-hour retention

- The uploaded zip is streamed to a temp file, parsed, and **deleted immediately** after processing — it is never placed in ARI file storage.
- Only aggregated summaries are stored (daily per-metric rows, workouts, activity-ring days, nightly sleep sessions, downsampled ECG waveforms, profile facts).
- Every stored row cascades from a single import row whose `expires_at` is set to upload time + 1 hour. Every module API request purges expired imports before reading, and all reads additionally filter `expires_at > now()`.
- A banner with a live countdown and a **Delete now** button is shown on every page while data is loaded.
- Uploading a new export replaces the previous one.

## What gets parsed

| Source in the zip | Result |
|---|---|
| `export.xml` (can be 1GB+) | Daily summaries for every `HKQuantityTypeIdentifier*` metric, sleep sessions, workouts, activity summaries, profile (`Me`) |
| `electrocardiograms/*.csv` | ECG recordings with classification + waveform downsampled to ≤1,200 points |
| `workout-routes/*.gpx` | GPS routes: distance/duration + path downsampled to ≤250 points, drawn to shape on the Routes page |
| `clinical-records/*.json` | FHIR records (immunizations etc.), shown on Overview |
| `export_cda.xml` | Skipped |

The parser is dependency-free: a minimal central-directory zip reader (`lib/zip-reader.ts`, ZIP64-aware, streams entries through `zlib.inflateRaw`) and a streaming XML tokenizer specialized for HealthKit exports (`lib/xml-stream.ts`). A ~900MB `export.xml` with ~2M records parses in a few seconds at ~200MB peak RSS.

Multi-source dedup: when the iPhone and Apple Watch both record a cumulative metric (steps, distance, energy), the source with the highest daily total wins — mirroring how the Health app deduplicates. Sampled metrics (heart rate, HRV, SpO2) merge all sources.

## Pages

- **Overview** — steps, distance, energy, exercise minutes, ring goal hit-rates
- **Heart** — daily HR range chart, resting HR, HRV, VO2 Max, cardio recovery
- **Sleep** — nightly stage breakdown (deep/core/REM/awake), efficiency
- **Workouts** — filterable table of all workouts with totals
- **Routes** — grid of GPS traces drawn to shape (green start / red finish dots), click to enlarge
- **ECG** — every recording with classification badge and waveform preview
- **Mobility** — walking metrics (speed, step length, steadiness…) and running dynamics
- **Vitals** — respiratory rate, blood oxygen, wrist temperature, weight, audio exposure
- **Clinical** — full table of FHIR records (immunizations etc.)
- **All Metrics** — profile, headline stats, step heatmap, and a catalog of every metric found

Charts bucket to weekly averages automatically on long ranges.

## API

All endpoints require auth and are documented in `/api-docs` under the `health-data` tag:
`POST upload?action=begin|chunk|finish` (chunked zip upload) · `GET status` · `GET summary` · `GET metrics?types=…` · `GET workouts` · `GET activity` · `GET sleep` · `GET routes` · `GET ecgs` · `DELETE data`

## Deployment notes

- **Uploads require a single server.** Chunked upload sessions live in process memory and assemble to an instance-local temp file, so every `begin`/`chunk`/`finish` request must hit the same process. On multi-instance or serverless hosting (e.g. Vercel with multiple lambdas) uploads cannot complete.
- **At-rest deletion is best-effort until the next request.** The 1-hour purge runs via an in-process sweeper started on the first module request after boot, plus a purge on every module request. After a server restart with no subsequent module traffic, expired rows are only deleted on the next module request (or the next restart that gets traffic). Expired data is never *readable* — every query filters `expires_at > now()` — but the rows may sit on disk until then.

## Removal

Disable the module in Settings → Features. To drop the tables entirely, run `database/uninstall.sql` manually in your SQL client (it is never auto-run).
