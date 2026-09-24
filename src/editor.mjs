// Pure art operations. Native Dota categories keep their original schema.
export const newLayer = (name='Main art') => ({id:globalThis.crypto.randomUUID(),name,visible:true,locked:false});
export function ensureEditor(doc){
  if(!Array.isArray(doc.layers)||!doc.layers.length)doc.layers=[newLayer()];
  if(!doc.layers.some(l=>l.id===doc.activeLayer))doc.activeLayer=doc.layers[0].id;
  doc.regions??=[];
  for(const a of doc.art){a.id??=globalThis.crypto.randomUUID();a.layer??=doc.activeLayer;}
  return doc;
}
export function visibleArt(doc){const layers=doc.layers||[];return doc.art.filter(a=>!a.hidden&&layers.find(l=>l.id===a.layer)?.visible!==false).sort((a,b)=>layers.findIndex(l=>l.id===a.layer)-layers.findIndex(l=>l.id===b.layer));}
export function editableArt(doc){return visibleArt(doc).filter(a=>!a.locked&&!doc.layers?.find(l=>l.id===a.layer)?.locked);}
export function cellKey(x,y,step){return `${Math.round(x/step)},${Math.round(y/step)}`;}
export function brushPoints(tool,start,end,step=12,controls=[]){
  const points=[],put=(x,y)=>points.push({x:Math.round(x/step)*step,y:Math.round(y/step)*step});
  if(tool==='pencil'||tool==='brush'){put(end.x,end.y);}
  else if(tool==='line'){const count=Math.max(1,Math.ceil(Math.hypot(end.x-start.x,end.y-start.y)/step));for(let i=0;i<=count;i++)put(start.x+(end.x-start.x)*i/count,start.y+(end.y-start.y)*i/count);}
  else if(tool==='rectangle'){for(const [a,b]of [[start,{x:end.x,y:start.y}],[{x:end.x,y:start.y},end],[end,{x:start.x,y:end.y}],[{x:start.x,y:end.y},start]])points.push(...brushPoints('line',a,b,step));}
  else if(tool==='ellipse'){const cx=(start.x+end.x)/2,cy=(start.y+end.y)/2,rx=Math.abs(end.x-start.x)/2,ry=Math.abs(end.y-start.y)/2,n=Math.max(12,Math.ceil(2*Math.PI*Math.max(rx,ry)/step));for(let i=0;i<n;i++){const t=i*2*Math.PI/n;put(cx+rx*Math.cos(t),cy+ry*Math.sin(t));}}
  else if(tool==='pen'&&controls.length===2){const n=Math.max(24,Math.ceil((Math.hypot(controls[0].x-start.x,controls[0].y-start.y)+Math.hypot(controls[1].x-controls[0].x,controls[1].y-controls[0].y)+Math.hypot(end.x-controls[1].x,end.y-controls[1].y))/step));for(let i=0;i<=n;i++){const t=i/n,u=1-t;put(u*u*u*start.x+3*u*u*t*controls[0].x+3*u*t*t*controls[1].x+t*t*t*end.x,u*u*u*start.y+3*u*u*t*controls[0].y+3*u*t*t*controls[1].y+t*t*t*end.y);}}
  return [...new Map(points.map(p=>[cellKey(p.x,p.y,step),p])).values()];
}
export function addStroke(doc,points,{symbol='#',step=12,mirrorX=false,mirrorY=false,width=1193.478271,height=600}={}){
  ensureEditor(doc);if(doc.layers.find(l=>l.id===doc.activeLayer)?.locked)throw Error('Слой заблокирован');
  if(!symbol.trim()||[...symbol].length!==1)throw Error('Выберите один символ кисти');
  const unique=new Map(doc.art.filter(a=>a.layer===doc.activeLayer).map(a=>[`${cellKey(a.x,a.y,step)}:${a.symbol}`,true]));
  const additions=[];for(const p of points){const variants=[p];if(mirrorX)variants.push({x:width-p.x,y:p.y});if(mirrorY)variants.push(...variants.map(v=>({x:v.x,y:height-v.y})));for(const v of variants){const key=`${cellKey(v.x,v.y,step)}:${symbol}`;if(v.x<0||v.x>width||v.y<0||v.y>height||unique.has(key))continue;unique.set(key,true);additions.push({...v,symbol,size:step,id:globalThis.crypto.randomUUID(),layer:doc.activeLayer});}}
  if(doc.art.length+additions.length>50000)throw Error('Предел проекта: 50 000 символов');doc.art.push(...additions);return additions;
}
export function connectedIds(art,seed,step=12){
  if(!seed)return new Set();const map=new Map();for(const a of art){const k=cellKey(a.x,a.y,step);if(!map.has(k))map.set(k,[]);map.get(k).push(a);}
  const first=cellKey(seed.x,seed.y,step),visited=new Set([first]),queue=[first],result=new Set();
  for(let i=0;i<queue.length;i++){const k=queue[i],items=map.get(k);if(!items)continue;for(const a of items)result.add(a.id);const [x,y]=k.split(',').map(Number);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const key=`${x+dx},${y+dy}`;if(!visited.has(key)&&map.has(key)){visited.add(key);queue.push(key);}}}return result;
}
export function floodPoints(art,start,step=12,width=1193.478271,height=600){
  const cols=Math.floor(width/step),rows=Math.floor(height/step),occupied=new Set(art.map(a=>cellKey(a.x,a.y,step))),first=cellKey(start.x,start.y,step);if(occupied.has(first))return [];
  const queue=[first],seen=new Set([first]),out=[];
  for(let i=0;i<queue.length;i++){const [x,y]=queue[i].split(',').map(Number);if(x<0||y<0||x>cols||y>rows||occupied.has(queue[i]))continue;out.push({x:x*step,y:y*step});if(out.length>15000)throw Error('Заливка слишком велика; увеличьте шаг кисти');for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const k=`${x+dx},${y+dy}`;if(!seen.has(k)){seen.add(k);queue.push(k);}}}return out;
}
export function bounds(art){if(!art.length)return null;let x=Infinity,y=Infinity,r=-Infinity,b=-Infinity;for(const a of art){x=Math.min(x,a.x);y=Math.min(y,a.y);r=Math.max(r,a.x);b=Math.max(b,a.y);}return{x,y,width:r-x,height:b-y,cx:(x+r)/2,cy:(y+b)/2};}
const directions={'─':0,'-':0,'╲':45,'\\':45,'│':90,'|':90,'╱':135,'/':135};
export function transformArt(art,operation,value=0){
  const b=bounds(art);if(!b)return;const angle=value*Math.PI/180;
  for(const a of art){const x=a.x-b.cx,y=a.y-b.cy;let orientation=directions[a.symbol];
    if(operation==='rotate'){a.x=b.cx+x*Math.cos(angle)-y*Math.sin(angle);a.y=b.cy+x*Math.sin(angle)+y*Math.cos(angle);if(orientation!==undefined)a.symbol=['─','╲','│','╱'][((Math.round((orientation+value)/45)%4)+4)%4];}
    if(operation==='flipX'){a.x=b.cx-x;if(orientation===45)a.symbol='╱';if(orientation===135)a.symbol='╲';}
    if(operation==='flipY'){a.y=b.cy-y;if(orientation===45)a.symbol='╱';if(orientation===135)a.symbol='╲';}
    if(operation==='scale'){a.x=b.cx+x*value;a.y=b.cy+y*value;}
    if(operation==='alignLeft')a.x=b.x;if(operation==='alignTop')a.y=b.y;if(operation==='alignCenter')a.x=b.cx;if(operation==='alignMiddle')a.y=b.cy;
  }
  if(operation==='distributeX'||operation==='distributeY'){const key=operation==='distributeX'?'x':'y',sorted=[...art].sort((a,b)=>a[key]-b[key]);if(sorted.length>2){const from=sorted[0][key],span=sorted.at(-1)[key]-from;sorted.forEach((a,i)=>a[key]=from+span*i/(sorted.length-1));}}
}
export function textArt(text,{x=30,y=40,advance=8,lineHeight=18,size=16,layer}={}){const art=[];text.split(/\r?\n/).forEach((line,row)=>[...line].forEach((symbol,col)=>{if(symbol.trim())art.push({id:globalThis.crypto.randomUUID(),symbol,x:x+col*advance,y:y+row*lineHeight,size,cellWidth:advance,cellHeight:lineHeight,layer});}));if(art.length>50000)throw Error('Текст слишком длинный');return art;}
export function fitArt(art,width=1193.478271,height=600){const b=bounds(art);if(!b)return;const s=Math.min((width-40)/Math.max(b.width,1),(height-40)/Math.max(b.height,1));for(const a of art){a.x=(a.x-b.cx)*s+width/2;a.y=(a.y-b.cy)*s+height/2;}}
export function diffArt(a,b){const key=x=>`${x.x.toFixed(2)}:${x.y.toFixed(2)}:${x.symbol}`;const ak=new Set(a.map(key)),bk=new Set(b.map(key));return{removed:a.filter(x=>!bk.has(key(x))),added:b.filter(x=>!ak.has(key(x))),unchanged:b.filter(x=>ak.has(key(x))).length};}
