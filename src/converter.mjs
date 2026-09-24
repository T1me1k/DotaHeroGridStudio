const QUALITY = { low: [48, 22], balanced: [78, 35], high: [110, 50], ultra: [150, 66] };
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export function tangentGlyph(angle, offset = 0) {
  // Image-space tangent = gradient normal + pi/2; y grows downwards.
  const sector = ((Math.round((angle + Math.PI / 2 + offset) / (Math.PI / 4)) % 4) + 4) % 4;
  return ['─', '╲', '│', '╱'][sector];
}
export function convertPixels(pixels, width, height, options = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 16000000 || pixels.length !== width * height * 4) throw Error('Invalid image dimensions or RGBA buffer');
  const mode = options.mode || 'line', q = QUALITY[options.quality] || QUALITY.balanced;
  if (!['line','ascii','silhouette','dither'].includes(mode)) throw Error('Unknown conversion mode');
  const cols = clamp(Math.round(options.columns || q[0]), 3, 180);
  const rows = clamp(Math.round(options.rows || (options.preserveAspect !== false ? cols * height / width * .5 : q[1])), 3, 80);
  const gray = new Float32Array(cols * rows), alpha = new Float32Array(cols * rows);
  const brightness = clamp(Number(options.brightness || 0), -100, 100), contrast = clamp(Number(options.contrast || 0), -100, 100);
  const threshold = clamp(Number(options.threshold ?? 70), 1, 255);
  const gamma = clamp(Number(options.gamma || 1), .1, 5);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const left = Math.floor(x*width/cols), right = Math.max(left+1,Math.floor((x+1)*width/cols));
    const top = Math.floor(y*height/rows), bottom = Math.max(top+1,Math.floor((y+1)*height/rows));
    let sum = 0, sumAlpha = 0, count = 0;
    for(let sy=top;sy<bottom;sy++)for(let sx=left;sx<right;sx++){
      const p=(Math.min(sy,height-1)*width+Math.min(sx,width-1))*4,a=pixels[p+3]/255;
      sum+=(.2126*pixels[p]+.7152*pixels[p+1]+.0722*pixels[p+2])*a+255*(1-a);sumAlpha+=a;count++;
    }
    const v=clamp((sum/count-128)*(1+contrast/100)+128+brightness,0,255);
    gray[y*cols+x]=255*Math.pow(v/255,1/gamma);alpha[y*cols+x]=sumAlpha/count;
  }
  const blur = clamp(Math.round(options.blur ?? (mode === 'line' ? 1 : 0)),0,3);
  for(let pass=0;pass<blur;pass++) { const src=gray.slice();for(let y=1;y<rows-1;y++)for(let x=1;x<cols-1;x++){const i=y*cols+x;gray[i]=(src[i]*4+(src[i-1]+src[i+1]+src[i-cols]+src[i+cols])*2+src[i-cols-1]+src[i-cols+1]+src[i+cols-1]+src[i+cols+1])/16;} }
  const magnitude=new Float32Array(gray.length),angle=new Float32Array(gray.length),mask=new Uint8Array(gray.length);
  if(mode==='line'){
    for(let y=1;y<rows-1;y++)for(let x=1;x<cols-1;x++){
      const i=y*cols+x;
      const gx=-gray[i-cols-1]+gray[i-cols+1]-2*gray[i-1]+2*gray[i+1]-gray[i+cols-1]+gray[i+cols+1];
      const gy=-gray[i-cols-1]-2*gray[i-cols]-gray[i-cols+1]+gray[i+cols-1]+2*gray[i+cols]+gray[i+cols+1];
      magnitude[i]=Math.hypot(gx,gy)/4;angle[i]=Math.atan2(gy,gx);
    }
    const dirs=[1,cols+1,cols,cols-1];
    for(let y=1;y<rows-1;y++)for(let x=1;x<cols-1;x++){
      const i=y*cols+x,d=dirs[((Math.round(angle[i]/(Math.PI/4))%4)+4)%4];
      // Strict on one side avoids double thickness on equal-strength plateaus.
      if(alpha[i]>=.15&&magnitude[i]>=threshold&&magnitude[i]>=magnitude[i-d]&&magnitude[i]>magnitude[i+d])mask[i]=1;
    }
    const seen=new Uint8Array(gray.length),minSize=clamp(Math.round(options.noise ?? 3),0,40);
    for(let i=0;i<mask.length;i++)if(mask[i]&&!seen[i]){
      const component=[i];seen[i]=1;
      for(let k=0;k<component.length;k++){const p=component[k],px=p%cols,py=Math.floor(p/cols);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=px+dx,yy=py+dy,ni=yy*cols+xx;if(xx>=0&&xx<cols&&yy>=0&&yy<rows&&mask[ni]&&!seen[ni]){seen[ni]=1;component.push(ni);}}}
      if(component.length<minSize)for(const p of component)mask[p]=0;
    }
  }
  let areaW=1150,areaH=550;
  if(options.preserveAspect!==false){const fit=Math.min(areaW/width,areaH/height);areaW=width*fit;areaH=height*fit;}
  const stepX=areaW/cols,stepY=areaH/rows,originX=(1193.478271-areaW)/2,originY=(600-areaH)/2;
  const chars=[...(options.characters || ' .:-=+*#%@')];
  const result=[],sampled=new Map(),sampling=clamp(Number(options.sampling||1),1,6);
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
    const i=y*cols+x;if(alpha[i]<.15)continue;let symbol;
    if(mode==='ascii')symbol=chars[Math.min(chars.length-1,Math.floor((255-gray[i])/256*chars.length))];
    else if(mode==='silhouette')symbol=gray[i]<threshold?(options.blockSymbol||'█'):' ';
    else if(mode==='dither'){
      const old=gray[i],value=old<threshold?0:255,err=old-value;symbol=value===0?'#':' ';
      for(const [dx,dy,k] of [[1,0,7],[-1,1,3],[0,1,5],[1,1,1]]){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<cols&&yy<rows)gray[yy*cols+xx]+=err*k/16;}
    }else{
      if(!mask[i])continue;symbol=tangentGlyph(angle[i],Number(options.angleOffset||0)*Math.PI/180);
      // Preserve bends while sampling straight portions more sparsely.
      const radius=options.simplify===false?sampling:Math.max(1,sampling*1.6);let skip=false;
      for(let dy=-Math.ceil(radius);dy<=0&&!skip;dy++)for(let dx=-Math.ceil(radius);dx<=Math.ceil(radius);dx++){
        const old=sampled.get(`${x+dx}:${y+dy}`);if(old!==undefined&&Math.hypot(dx,dy)<radius&&Math.abs(Math.sin(old-angle[i]))<.25){skip=true;break;}
      }
      if(skip)continue;sampled.set(`${x}:${y}`,angle[i]);
    }
    if(!symbol||!symbol.trim())continue;
    result.push({x:originX+x*stepX,y:originY+y*stepY,symbol,size:Math.max(8,Math.min(stepX,stepY)),cellWidth:stepX,cellHeight:stepY,row:y,column:x});
  }
  return result;
}
