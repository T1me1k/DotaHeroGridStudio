// Only the six real Dota category fields cross the export boundary.
export const DEFAULT_EXPORT = Object.freeze({ enabled: true, mode: 'auto', xOffset: 0, yOffset: 0,
  horizontalSpacing: 1, verticalSpacing: 1, baselineOffset: 0, preserveAspect: true,
  runAdvance: 8, tolerance: 0.2, maxRunLength: 64, budget: 1200, asciiFallback: true });
export const SYMBOL_SETS = { ASCII: ' .:-=+*#%@', LINES: '─│/\\', BOX: '─│╱╲┌┐└┘', BLOCKS: ' ░▒▓█', DOTS: ' .·•:', CUSTOM: ' .:-=+*#%@' };
export const FALLBACKS = { '╱': '/', '╲': '\\', '─': '-', '│': '|', '█': '#', '▓': '#', '▒': '+', '░': '.', '•': '*', '·': '.', '┌': '+', '┐': '+', '└': '+', '┘': '+', '├': '+', '┤': '+', '┬': '+', '┴': '+', '┼': '+' };
export function textCategory(text, x, y) { return { category_name: text, x_position: x, y_position: y, width: 0, height: 0, hero_ids: [] }; }
export function isTextCategory(c) { return c.width === 0 && c.height === 0 && c.hero_ids.length === 0; }
export function validateArt(art) {
  if (!Array.isArray(art) || art.length > 50000) throw Error('Art must be an array with at most 50,000 symbols');
  art.forEach((a, i) => {
    if (!a || typeof a.symbol !== 'string' || !a.symbol.length || a.symbol.length > 256 || /[\x00-\x1f\x7f]/.test(a.symbol)) throw Error(`art[${i}].symbol is invalid`);
    for (const key of ['x', 'y']) if (!Number.isFinite(a[key])) throw Error(`art[${i}].${key} must be finite`);
    if (a.size !== undefined && (!Number.isFinite(a.size) || a.size <= 0)) throw Error(`art[${i}].size must be positive`);
  });
}
export function normalizeExport(input = {}) {
  const o = { ...DEFAULT_EXPORT, ...input };
  if (!['auto', 'runs', 'glyph'].includes(o.mode)) throw Error('Unknown art export mode');
  for (const key of ['xOffset', 'yOffset', 'baselineOffset', 'horizontalSpacing', 'verticalSpacing', 'runAdvance', 'budget', 'tolerance', 'maxRunLength']) {
    if (!Number.isFinite(o[key])) throw Error(`Export ${key} must be finite`);
  }
  if (o.horizontalSpacing <= 0 || o.verticalSpacing <= 0 || o.runAdvance <= 0 || o.tolerance < 0 || o.tolerance > 1) throw Error('Spacing must be positive and tolerance between 0 and 1');
  if (!Number.isInteger(o.budget) || o.budget < 1 || o.budget > 10000) throw Error('Category budget must be between 1 and 10,000');
  if (!Number.isInteger(o.maxRunLength) || o.maxRunLength < 1 || o.maxRunLength > 128) throw Error('Text run length must be between 1 and 128');
  if (o.preserveAspect) o.verticalSpacing = o.horizontalSpacing;
  return o;
}
export function compatibleText(text, options, report) {
  const supported = options.supportedGlyphs ? new Set(options.supportedGlyphs) : null;
  const has = c => supported ? supported.has(c) : !options.asciiFallback || /^[\x20-\x7e]$/.test(c);
  return [...text].map(c => {
    if (has(c)) return c;
    const replacement = [FALLBACKS[c], '#', '?', '.'].find(v => v && has(v));
    if (!replacement) throw Error(`Font has no fallback for ${c}`);
    report.fallbackCount++; return replacement;
  }).join('');
}
export function buildArtExport(art, input = {}) {
  validateArt(art);
  const options = normalizeExport(input), report = { symbols: art.length, fallbackCount: 0, categories: [], reduction: 0, warnings: [] };
  if (!options.enabled) return report;
  const items = art.filter(a => a.symbol.trim()).map(a => ({ x: a.x * options.horizontalSpacing + options.xOffset,
    y: a.y * options.verticalSpacing + options.yOffset + options.baselineOffset,
    size: a.size ?? 16, text: compatibleText(a.symbol, options, report) }));
  // Group only continuous cells. Never bridge gaps or insert uncalibrated whitespace.
  // Anchored row quantisation avoids merging a staircase into one line.
  const rows = new Map();
  for (const a of items) {
    const key = options.mode === 'glyph' ? rows.size : `${a.size}:${Math.round(a.y * 1000)}`;
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(a);
  }
  for (const row of rows.values()) {
    row.sort((a,b) => a.x - b.x);
    let run = null, expected = 0;
    for (const a of row) {
      const advance = [...a.text].reduce((sum, c) => sum + (options.advanceByGlyph?.[c] ?? options.runAdvance), 0);
      if (!Number.isFinite(advance) || advance <= 0) throw Error('Glyph advance must be positive');
      const fits = options.mode !== 'glyph' && run && Math.abs(a.x - expected) <= options.tolerance && [...run.category_name, ...a.text].length <= options.maxRunLength;
      if (fits) run.category_name += a.text;
      else { run = textCategory(a.text, a.x, a.y); report.categories.push(run); }
      expected = a.x + advance;
    }
  }
  report.reduction = items.length ? 100 * (1 - report.categories.length / items.length) : 0;
  if (report.fallbackCount) report.warnings.push(`${report.fallbackCount} glyphs replaced by compatible fallback`);
  if (!options.supportedGlyphs) report.warnings.push('Radiance not loaded: glyph coverage and text metrics are unverified');
  if (report.categories.length > options.budget) report.warnings.push(`Category budget exceeded: ${report.categories.length} > ${options.budget}`);
  return report;
}
export function artToDotaCategories(art, options = {}) { return buildArtExport(art, options).categories; }
export function enforceBudget(count, options = {}) {
  const { budget } = normalizeExport(options);
  if (count > budget) throw Error(`Получилось ${count} категорий при бюджете ${budget}. Уменьшите качество/плотность или осознанно увеличьте бюджет. Экспорт не обрезает рисунок.`);
}
export function calibrationConfig() {
  const categories = [textCategory('DOTA GLYPH CALIBRATION v0.2', 30, 20), textCategory('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 30, 55),
    textCategory('abcdefghijklmnopqrstuvwxyz', 30, 90), textCategory('0123456789', 30, 125)];
  const glyphs = [...'█▓▒░─│╱╲/\\_-+=*#@%.:;┌┐└┘├┤┬┴┼'];
  glyphs.forEach((g,i) => { const x = 30 + i % 10 * 110, y = 180 + Math.floor(i/10)*75;
    categories.push(textCategory(`${i + 1}: U+${g.codePointAt(0).toString(16).toUpperCase()}`, x, y));
    categories.push(textCategory(g, x, y+28)); });
  categories.push(textCategory('RUN: WWWWiiii####',30,430),textCategory('GLYPHS: spacing 8 / 12 / 16',30,470));
  [8,12,16].forEach((gap,r) => [...'####/\\-||'].forEach((g,i) => categories.push(textCategory(g, 350+i*gap,430+r*40))));
  return { config_name: 'Dota Glyph Calibration v0.2', categories };
}
