export function sanitizeSvg(text) {
  if (text.length > 4000000 || /<!DOCTYPE|<!ENTITY/i.test(text)) throw Error('SVG слишком большой или содержит DTD');
  const xml = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (xml.querySelector('parsererror') || xml.documentElement.localName !== 'svg') throw Error('Неверный SVG');
  const allowed = new Set(['svg','g','path','rect','circle','ellipse','line','polyline','polygon','text','tspan','defs','linearGradient','radialGradient','stop','clipPath','title','desc']);
  for (const el of [...xml.querySelectorAll('*')]) {
    if (!allowed.has(el.localName)) { el.remove(); continue; }
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name) || /href|src/i.test(attr.name) || attr.name === 'style' || (/url\(/i.test(attr.value) && !/^url\(#[\w-]+\)$/.test(attr.value))) el.removeAttribute(attr.name);
    }
  }
  const root=xml.documentElement;root.setAttribute('xmlns','http://www.w3.org/2000/svg');
  const view=(root.getAttribute('viewBox')||'0 0 800 600').trim().split(/[\s,]+/).map(Number);
  const width=parseFloat(root.getAttribute('width'))||view[2],height=parseFloat(root.getAttribute('height'))||view[3];
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('Неверный размер SVG');
  if(!root.hasAttribute('viewBox'))root.setAttribute('viewBox',`0 0 ${width} ${height}`);
  const scale=Math.min(1,1400/Math.max(width,height));root.setAttribute('width',String(Math.max(1,Math.round(width*scale))));root.setAttribute('height',String(Math.max(1,Math.round(height*scale))));
  return new XMLSerializer().serializeToString(xml);
}
