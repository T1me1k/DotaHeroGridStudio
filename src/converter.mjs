const quality = { low: [48, 22], balanced: [78, 35], high: [110, 50], ultra: [150, 66] };
export function convertPixels(pixels, width, height, options = {}) {
  const mode = options.mode || 'line', q = quality[options.quality] || quality.balanced;
  const columns = Math.min(options.columns || q[0], 180), rows = Math.min(options.rows || q[1], 80);
  const lum = new Float32Array(columns * rows), alpha = new Float32Array(columns * rows);
  const brightness = Number(options.brightness || 0), contrast = Number(options.contrast || 0), threshold = Number(options.threshold ?? 110);
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const sx = Math.min(width - 1, Math.floor((x + .5) * width / columns)), sy = Math.min(height - 1, Math.floor((y + .5) * height / rows)), p = (sy * width + sx) * 4;
    const a = pixels[p + 3] / 255;
    const v = (.2126 * pixels[p] + .7152 * pixels[p + 1] + .0722 * pixels[p + 2]);
    lum[y * columns + x] = Math.max(0, Math.min(255, (v - 128) * (1 + contrast / 100) + 128 + brightness)); alpha[y * columns + x] = a;
  }
  const result = [], stepX = 1193.478271 / columns, stepY = 580 / rows;
  const chars = options.characters || ' .:-=+*#%@';
  for (let y = 1; y < rows - 1; y++) for (let x = 1; x < columns - 1; x++) {
    const i = y * columns + x; if (alpha[i] < .15) continue;
    let symbol;
    if (mode === 'ascii') symbol = chars[Math.min(chars.length - 1, Math.floor((255 - lum[i]) / 256 * chars.length))];
    else if (mode === 'silhouette') symbol = lum[i] < threshold ? '█' : ' ';
    else {
      const dx = lum[i + 1] - lum[i - 1], dy = lum[i + columns] - lum[i - columns];
      if (Math.hypot(dx, dy) < threshold * .55) continue;
      symbol = Math.abs(dx) > Math.abs(dy) * 2 ? '│' : Math.abs(dy) > Math.abs(dx) * 2 ? '─' : dx * dy > 0 ? '╲' : '╱';
    }
    if (!symbol || symbol === ' ') continue;
    result.push({ x: x * stepX, y: y * stepY, symbol, size: Math.max(8, Math.min(stepX, stepY) * .95) });
  }
  return result;
}
