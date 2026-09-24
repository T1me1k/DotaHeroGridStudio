# Dota Hero Grid Studio

Early functional release (v0.1). A local editor for Dota 2 hero grid **categories and hero IDs**, with image conversion to an editor-only symbol sketch. The converter's symbol sketch is **not exported to Dota**: published `hero_grid_config.json` examples show categories with positions, dimensions and `hero_ids`, but do not establish support for arbitrary glyph objects. Do not expect imported images to appear in Dota until a real game-tested technique is verified.

## Run

Requires Node.js 20+. The web editor has no runtime dependencies:

```sh
npm run dev
```

Open `http://127.0.0.1:4173`. Run `npm test`, `npm run typecheck`, `npm run build` to check the project.

For Windows desktop install: install Node.js, Rust, Visual Studio C++ Build Tools and WebView2; run `npm install`, then `npm run tauri -- dev` or `npm run tauri -- build`. Windows binaries were not produced or tested in the Linux authoring environment.

## Use

Drag a PNG/JPEG/WebP onto the app and choose Line Art, ASCII or Silhouette. The converted picture is visible on the canvas and saved in a `.dotagrid` project. Choose **Save project** to keep image and symbols. Pan, zoom at cursor, select and move category rectangles, edit category sizes and positive integer hero IDs. Undo/redo works for category edits and conversion.

**Open** accepts `.dotagrid` and `hero_grid_config.json`. **Export JSON** adds the edited config to imported configs (renaming duplicate names), preserving unknown fields in older configs. The downloaded file is only a Dota-shaped export of categories and heroes. No automatic claim is made that every generated grid will look identical in the game.

In the Windows Tauri app, click **Refresh accounts**, select a discovered Steam account, and **Install to Dota**. Installation refuses a symbol sketch to avoid losing the visible composition. It refuses to modify a file if Dota is running, reads the existing config, appends the new grid, writes a timestamped backup in `cfg/DotaHeroGridStudio_backups`, and replaces the file. Only existing standard Steam installs under common folders are discovered in this version. Close Dota before installation and retain your own copy of the config.

## Format and limits

`fixtures/sample_hero_grid_config.json` uses the public version 3 structure. The format adapter accepts unknown extra fields and retains existing configs. `.dotagrid` is a separate versioned project format. The artboard dimensions are approximate; user game testing with a current grid is still required. The Windows installer path and Tauri compilation are unverified on a Windows machine. This release does not include Canny, custom glyph rendering in Dota, batch processing, groups, shapes, Radiance metrics, localization, or a Windows executable.

Source examples for the grid structure: [Cyborgmatt's config](https://gist.github.com/Cyborgmatt/3b403178ee0b88bed2be9c523fbcb2b7) and [angrybacon's config](https://gist.github.com/angrybacon/6f36771519ddb0e7bbc045ece27d9898).
