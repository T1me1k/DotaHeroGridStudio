export const ARTBOARD = { width: 1193.478271, height: 600 };
export const newDocument = () => ({ formatVersion: 1, name: 'My grid', categories: [], art: [], image: null, settings: { mode: 'line', quality: 'balanced', threshold: 110 }, imported: { version: 3, configs: [] } });
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
export function currentConfig(doc) { return { config_name: doc.name || 'My grid', categories: doc.categories.map(c => ({ ...c, hero_ids: [...c.hero_ids] })) }; }
export function uniqueName(name, names) { let n = name, i = 2; while (names.has(n)) n = `${name} (${i++})`; return n; }
export function exportDota(doc, existing = doc.imported) {
  const base = structuredClone(existing || { version: 3, configs: [] });
  if (!Array.isArray(base.configs)) throw Error('Existing file has invalid configs');
  const next = currentConfig(doc);
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
  if (last) { doc.name = last.config_name; doc.categories = structuredClone(last.categories); doc.imported = { ...root, configs: root.configs.slice(0, -1) }; }
  return doc;
}
export function parseProject(text) {
  const data = JSON.parse(text);
  if (!object(data) || data.formatVersion !== 1 || !Array.isArray(data.categories) || !Array.isArray(data.art) || !object(data.settings)) throw Error('Invalid .dotagrid project');
  const errors = validateDota({ version: 3, configs: [{ config_name: data.name, categories: data.categories }] });
  if (errors.length) throw Error(errors.join('\n'));
  return data;
}
export function projectJSON(doc) { return JSON.stringify({ ...doc, modifiedAt: new Date().toISOString() }, null, 2); }
