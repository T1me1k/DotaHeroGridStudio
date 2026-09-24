// Read Unicode cmap directly: Canvas alone can silently substitute a fallback font.
export function fontCoverage(buffer) {
  const view = new DataView(buffer), len = buffer.byteLength;
  const u16 = p => { if (p<0||p+2>len) throw Error('Invalid font table'); return view.getUint16(p); };
  const u32 = p => { if (p<0||p+4>len) throw Error('Invalid font table'); return view.getUint32(p); };
  if (![0x00010000,0x4f54544f].includes(u32(0))) throw Error('Загрузите TTF или OTF (не WOFF/коллекцию)');
  let cmap = -1;
  for(let i=0;i<u16(4);i++){const p=12+i*16;if(u32(p)===0x636d6170){cmap=u32(p+8);if(cmap+u32(p+12)>len)throw Error('Invalid cmap length');}}
  if(cmap<0)throw Error('Font has no cmap');
  const tables=[];
  for(let i=0;i<u16(cmap+2);i++){
    const r=cmap+4+i*8,platform=u16(r),encoding=u16(r+2),offset=cmap+u32(r+4),format=u16(offset);
    if((platform===0||(platform===3&&[1,10].includes(encoding)))&&[4,12].includes(format))tables.push({offset,format});
  }
  if(!tables.length)throw Error('Font has no supported Unicode cmap');
  return character => {
    const code=character.codePointAt(0);
    for(const {offset:p,format} of tables){
      if(format===12){const n=u32(p+12);if(n>100000||p+16+n*12>len)throw Error('Invalid cmap groups');for(let i=0;i<n;i++){const g=p+16+i*12,start=u32(g),end=u32(g+4);if(code>=start&&code<=end)return u32(g+8)+code-start!==0;}}
      else if(code<=65535){const n=u16(p+6)/2,end=p+14,start=end+n*2+2,delta=start+n*2,ranges=delta+n*2;for(let i=0;i<n;i++){if(code<u16(start+i*2)||code>u16(end+i*2))continue;const range=u16(ranges+i*2),d=u16(delta+i*2);if(range===0)return ((code+d)&65535)!==0;const glyph=u16(ranges+i*2+range+(code-u16(start+i*2))*2);return glyph!==0&&((glyph+d)&65535)!==0;}}
    }return false;
  };
}
export function encodeFont(bytes){let result='';for(let p=0;p<bytes.length;p+=16384)result+=String.fromCharCode(...bytes.subarray(p,p+16384));return btoa(result);}
export function decodeFont(text){return Uint8Array.from(atob(text),c=>c.charCodeAt(0)).buffer;}
