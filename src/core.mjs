import { DEFAULT_EXPORT, buildArtExport, enforceBudget, normalizeExport, validateArt } from './art-export.mjs';
export const ARTBOARD = { width: 1193.478271, height: 600 };
export const newDocument = () => ({ formatVersion: 2, appVersion: '0.2.0', createdAt: new Date().toISOString(), name: 'My grid', categories: [], art: [], image: null, font: null, exportSettings: { ...DEFAULT_EXPORT }, settings: { mode: 'line', quality: 'balanced', threshold: 70, blur: 1, noise: 3, sampling: 1, simplify: true, preserveAspect: true }, imported: { version: 3, configs: [] } });
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export function validateDota(value) {
  const errors = [];
  if (!object(value)) return ['root must be an object'];
  if (!Number.isInteger(value.version)) errors.push('version must be an integer');
  if (!Array.isArray(value.configs)) return [...errors, 'configs must be an array'];
  value.configs.forEach((config, i) => {
    if (!object(config)) { errors.push(`configs[${i}] must be an object`); return; }
    if (typeof config.config_name !== 'string') errors.push(`configs[${i}].config_name must be a string`);
    if (!Array.isArray(config.categories)) { errors.push(`configs[${i}].categories must be an array`); return; }
    config.categories.forEach((cat, j) => {
      const p = `configs[${i}].categories[${j}]`;
      if (!object(cat)) { errors.push(`${p} must be an object`); return; }
      if (typeof cat.category_name !== 'string') errors.push(`${p}.category_name must be a string`);
      for (const k of ['x_position', 'y_position', 'width', 'height']) if (typeof cat[k] !== 'number' || !Number.isFinite(cat[k]) || (['width', 'height'].includes(k) && cat[k] < 0)) errors.push(`${p}.${k} must be a finite ${['width','height'].includes(k) ? 'nonnegative ' : ''}number`);
      if (!Array.isArray(cat.hero_ids) || !cat.hero_ids.every(n => Number.isInteger(n) && n > 0)) errors.push(`${p}.hero_ids must be an array of positive integer IDs`);
    });
  });
  return errors;
}
export function parseDota(text) { const root = JSON.parse(text); const errors = validateDota(root); if (errors.length) throw Error(errors.slice(0, 10).join('\n')); return root; }
export function category(name = 'New category', x = 100, y = 100, width = 300, height = 130, ids = []) { return { category_name: name, x_position: x, y_position: y, width, height, hero_ids: ids }; }
export function exportReport(doc, runtimeOptions = {}) {
  const options = { ...DEFAULT_EXPORT, ...doc.exportSettings, ...runtimeOptions };
  const art = buildArtExport(doc.art, options);
  const config = { ...doc.sourceConfig, config_name: doc.name || 'My grid', categories: [...structuredClone(doc.categories), ...art.categories] };
  return { ...art, config, total: config.categories.length, bytes: new TextEncoder().encode(JSON.stringify({ version: 3, configs: [config] })).length, options };
}
export function currentConfig(doc, runtimeOptions = {}) {
  const result = exportReport(doc, runtimeOptions);
  enforceBudget(result.total, result.options);
  return result.config;
}
export function uniqueName(name, names) { let n = name, i = 2; while (names.has(n)) n = `${name} (${i++})`; return n; }
export function exportDota(doc, existing = doc.imported, runtimeOptions = {}) {
  const base = structuredClone(existing || { version: 3, configs: [] });
  if (!Array.isArray(base.configs)) throw Error('Existing file has invalid configs');
  const next = currentConfig(doc, runtimeOptions);
  next.config_name = uniqueName(next.config_name, new Set(base.configs.map(c => c.config_name)));
  base.configs.push(next);
  if (!Number.isInteger(base.version)) base.version = 3;
  const errors = validateDota(base); if (errors.length) throw Error(errors.join('\n'));
  return base;
}
export function importDota(text) {
  const root = parseDota(text);
  const doc = newDocument(); doc.imported = root;
  const last = root.configs.at(-1);
  if (last) { doc.name = last.config_name; doc.categories = structuredClone(last.categories); doc.sourceConfig = structuredClone(last); delete doc.sourceConfig.categories; doc.imported = { ...root, configs: root.configs.slice(0, -1) }; }
  return doc;
}
export function parseProject(text) {
  const data = JSON.parse(text);
  if (!object(data) || ![1,2].includes(data.formatVersion) || !Array.isArray(data.categories) || !Array.isArray(data.art) || !object(data.settings)) throw Error('Invalid .dotagrid project');
  const errors = validateDota({ version: 3, configs: [{ config_name: data.name, categories: data.categories }] });
  if (errors.length) throw Error(errors.join('\n'));
  validateArt(data.art);
  if (data.imported) { const importedErrors = validateDota(data.imported); if (importedErrors.length) throw Error(importedErrors.join('\n')); }
  if (data.image && (typeof data.image !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(data.image))) throw Error('Invalid embedded image');
  const out = { ...newDocument(), ...data, formatVersion: 2 };
  out.exportSettings = normalizeExport(data.exportSettings);
  if (out.font && (!object(out.font) || typeof out.font.data !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(out.font.data) || out.font.data.length > 14000000)) throw Error('Invalid embedded font');
  return out;
}
export function projectJSON(doc) { return JSON.stringify({ ...doc, modifiedAt: new Date().toISOString() }, null, 2); }
