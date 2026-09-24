import { convertPixels } from './converter.mjs';
self.onmessage = ({ data }) => {
  try { self.postMessage({ id: data.id, art: convertPixels(data.pixels, data.width, data.height, data.options) }); }
  catch (error) { self.postMessage({ id: data.id, error: error.message }); }
};
