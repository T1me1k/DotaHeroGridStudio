# v0.2.0

- Export artwork as native empty text categories; shared export/install pipeline.
- Per glyph, conservative Auto/Text runs, calibrated coordinates, glyph fallback, hard budget without truncation.
- Export preview, JSON preview, category counts/reduction, full calibration and small probe fixtures.
- Import Text-category heuristic; preserve config/root/category unknown fields; migrate v0.1 projects.
- Worker image conversion with area sampling, alpha handling, Sobel, nonmaximum suppression, noise filtering, angle-aware/adaptive sampling; Dither mode.
- Load and embed TTF/OTF; cmap coverage and measured glyph advances; symbol presets.
- Fix v0.1 JSON/project opening and pan coordinates; limit displayed category list; undo snapshots share embedded assets.
- Registry Steam discovery, create missing JSON, validate/backup/atomic merge, backup history and restoration, retention.
- Windows Actions NSIS build and artifact upload, no automatic Release.
