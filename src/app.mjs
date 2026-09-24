import { ARTBOARD, category, currentConfig, exportDota, exportReport, importDota, newDocument, parseProject, projectJSON } from './core.mjs';
import { calibrationConfig, isTextCategory, normalizeExport, SYMBOL_SETS } from './art-export.mjs';
import { fontCoverage, encodeFont, decodeFont } from './font.mjs';
import {createStudio} from './studio-ui.mjs';
import {ensureEditor,visibleArt} from './editor.mjs';
import {ensureBoards} from './manager.mjs';
import {sanitizeSvg} from './svg.mjs';
let studio=null;
const $=id=>document.getElementById(id),canvas=$('canvas'),ctx=canvas.getContext('2d');
let doc=newDocument(),selected=-1,tool='select',grid=true,scale=.57,offset={x:80,y:100},drag=null,sourceImage=null,history=[],future=[];
let report=null,limit=80,loadedFont=null,coverage=null,revision=0,conversion=null;
const notify=(message,error=false)=>{$('message').textContent=message;$('message').style.color=error?'#ff9f9f':'#a9c9e7';$('status').textContent=message.split('\n')[0];};
const guard=fn=>async(...args)=>{try{await fn(...args);}catch(e){notify(e.message||String(e),true);}};
function cloneState(v){if(Array.isArray(v))return v.map(cloneState);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,cloneState(x)]));return v;}
function snapshot(){return {state:cloneState(doc)};}
function remember(){history.push(snapshot());if(history.length>30)history.shift();future=[];}
function cancelConversion(){if(conversion){conversion.terminate();conversion=null;}$('convert').disabled=false;}
async function restore(value){
  revision++;const own=revision;cancelConversion();doc=value.state?cloneState(value.state):value;ensureEditor(doc);ensureBoards(doc);studio?.onRestore();
  selected=-1;limit=80;sourceImage=null;writeControls();sync();
  if(doc.image){const img=await loadImage(doc.image);if(own===revision){sourceImage=img;$('imageInfo').textContent=`Изображение · ${img.width} × ${img.height}`;render();}}
  else $('imageInfo').textContent='Изображение не загружено';
  await useFont(doc.font,own);sync();
}
function glyphs(){return [...new Set([...Object.values(SYMBOL_SETS).join(''),...doc.art.map(a=>a.symbol).join(''),...doc.categories.filter(isTextCategory).map(c=>c.category_name).join(''),'#?.|-/\\'])];}
function runtimeOptions(){
  if(!coverage)return {};
  const chars=glyphs(),metrics={};ctx.save();ctx.font='16px StudioRadiance';const base=ctx.measureText('M').width||8;
  for(const c of chars)metrics[c]=ctx.measureText(c).width*doc.exportSettings.runAdvance/base;ctx.restore();if(doc.font)doc.font.advances=Object.fromEntries(Object.entries(metrics).map(([c,n])=>[c,n/doc.exportSettings.runAdvance]));
  return {supportedGlyphs:chars.filter(c=>coverage(c)),advanceByGlyph:metrics};
}
function sync(){
  ensureEditor(doc);ensureBoards(doc);studio?.sync();
  $('name').value=doc.name;$('categoryList').replaceChildren();
  doc.categories.slice(0,limit).forEach((c,i)=>{const item=document.createElement('button');item.className='cat'+(i===selected?' selected':'');item.style.width='100%';item.style.textAlign='left';const title=document.createElement('strong'),detail=document.createElement('small');title.textContent=c.category_name||'(пустая категория)';detail.textContent=`${isTextCategory(c)?'Text':`Hero · ${c.hero_ids.length}`} · ${Math.round(c.x_position)}, ${Math.round(c.y_position)}`;item.append(title,detail);item.onclick=()=>{selected=i;sync();};$('categoryList').append(item);});
  $('moreCategories').hidden=limit>=doc.categories.length;
  const c=doc.categories[selected];
  $('inspector').innerHTML=c?`<p>Type: ${isTextCategory(c)?'Text':'Hero'}</p><div class="inspectorGrid"><label class="full">Название / текст<input data-key="category_name" type="text"></label><label>X<input data-key="x_position" type="number" step="1"></label><label>Y<input data-key="y_position" type="number" step="1"></label><label>Ширина<input data-key="width" type="number" min="0"></label><label>Высота<input data-key="height" type="number" min="0"></label><label class="full">ID героев через запятую<input data-key="hero_ids" type="text"></label></div><button id="deleteCategory" class="wide">Удалить категорию</button>`:'Выберите категорию. Рисунок перемещается и масштабируется через Dota Text Calibration.';
  if(c){for(const input of $('inspector').querySelectorAll('[data-key]')){const key=input.dataset.key;input.value=Array.isArray(c[key])?c[key].join(', '):c[key];input.onchange=guard(()=>{let value=input.value;if(key==='hero_ids'){value=value.split(/[,\s]+/).filter(Boolean).map(Number);if(value.some(v=>!Number.isInteger(v)||v<1))throw Error('ID героев должны быть положительными целыми числами');}else if(input.type==='number'){value=Number(value);if(!Number.isFinite(value)||(['width','height'].includes(key)&&value<0))throw Error('Размер не может быть отрицательным');}remember();c[key]=value;sync();});}$('deleteCategory').onclick=()=>{remember();doc.categories.splice(selected,1);selected=-1;sync();};}
  $('empty').hidden=!!(doc.categories.length||doc.art.length||doc.image);
  try{report=exportReport(doc,runtimeOptions());$('exportStats').textContent=`Art symbols: ${doc.art.length}\nDota art categories: ${report.categories.length}\nImported / hero / text: ${doc.categories.length}\nTotal: ${report.total} · ${Math.ceil(report.bytes/1024)} КБ\nReduction: ${report.reduction.toFixed(1)}% · fallback: ${report.fallbackCount}`;
    const warnings=[];if(report.total>doc.exportSettings.budget)warnings.push(`Бюджет превышен: ${report.total} > ${doc.exportSettings.budget}. Уменьшите плотность или измените бюджет.`);if(report.total>3000)warnings.push('Большое число категорий может потреблять много памяти в Dota.');if(doc.art.length&&!doc.exportSettings.enabled)warnings.push('Экспорт рисунка выключен.');$('budgetWarning').textContent=warnings.join('\n');
    $('stats').textContent=`${report.total} Dota categories · ${doc.art.length} symbols · ${Math.ceil(report.bytes/1024)} КБ`;
  }catch(e){report=null;$('budgetWarning').textContent=e.message;}
  $('zoomLabel').textContent=Math.round(scale*100)+'%';$('undo').disabled=!history.length;$('redo').disabled=!future.length;
  const list=glyphs();$('glyphStatus').textContent=coverage?list.map(c=>`${c===' '?'space':c}: ${coverage(c)?'✓':'fallback'}`).join('  '):'Без Radiance фактическая поддержка glyph неизвестна. ASCII fallback включён по умолчанию.';
  render();
}
function resize(){const r=canvas.getBoundingClientRect(),dpr=devicePixelRatio||1;canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);render();}
function drawText(c){ctx.save();ctx.fillStyle='#cce5f7';ctx.textAlign='left';ctx.textBaseline='top';ctx.font=`16px ${loadedFont?'StudioRadiance':'monospace'}`;const m=ctx.measureText('M').width||8;ctx.translate(c.x_position,c.y_position);ctx.scale(doc.exportSettings.runAdvance/m,1);ctx.fillText(c.category_name,0,0);ctx.restore();}
function render(){
  ctx.clearRect(0,0,canvas.clientWidth,canvas.clientHeight);ctx.save();ctx.translate(offset.x,offset.y);ctx.scale(scale,scale);const exported=$('previewMode').value==='dota',fast=!!drag||studio?.isDragging();
  ctx.fillStyle='#172334';ctx.strokeStyle='#526a86';ctx.lineWidth=2/scale;ctx.fillRect(0,0,ARTBOARD.width,ARTBOARD.height);ctx.strokeRect(0,0,ARTBOARD.width,ARTBOARD.height);
  if(grid&&!exported){ctx.beginPath();ctx.strokeStyle='#2d4055';ctx.lineWidth=.7/scale;for(let x=0;x<ARTBOARD.width;x+=50){ctx.moveTo(x,0);ctx.lineTo(x,ARTBOARD.height);}for(let y=0;y<ARTBOARD.height;y+=50){ctx.moveTo(0,y);ctx.lineTo(ARTBOARD.width,y);}ctx.stroke();}
  if(sourceImage&&!exported){const s=Math.min(1150/sourceImage.width,550/sourceImage.height),w=sourceImage.width*s,h=sourceImage.height*s;ctx.globalAlpha=.13;ctx.drawImage(sourceImage,(ARTBOARD.width-w)/2,(600-h)/2,w,h);ctx.globalAlpha=1;}
  ctx.fillStyle='#b9d9f0';ctx.textAlign='left';ctx.textBaseline='top';
  if(exported&&report){for(const c of report.categories)drawText(c);}else{const art=visibleArt(doc),stride=fast?Math.max(1,Math.ceil(art.length/6000)):1;for(let i=0;i<art.length;i+=stride){const a=art[i];ctx.font=`${a.size||16}px ${loadedFont?'StudioRadiance':'monospace'}`;ctx.fillText(a.symbol,a.x,a.y);}}
  doc.categories.forEach((c,i)=>{if(isTextCategory(c)){drawText(c);if(i===selected&&!exported){ctx.strokeStyle='#78c5ff';ctx.lineWidth=1/scale;ctx.strokeRect(c.x_position,c.y_position,Math.max(12,[...c.category_name].length*doc.exportSettings.runAdvance),18);}return;}
    ctx.fillStyle=i===selected&&!exported?'#2e81ce55':'#28476878';ctx.strokeStyle=i===selected&&!exported?'#78c5ff':'#7c9fbf';ctx.lineWidth=1/scale;ctx.fillRect(c.x_position,c.y_position,c.width,c.height);ctx.strokeRect(c.x_position,c.y_position,c.width,c.height);ctx.font='17px system-ui';ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle='#e5f1fb';ctx.fillText(c.category_name,c.x_position+9,c.y_position+7);ctx.font='12px system-ui';ctx.fillStyle='#a5b9cb';ctx.fillText(c.hero_ids.join(', '),c.x_position+9,c.y_position+32);});studio?.renderOverlay(ctx,scale);ctx.restore();
}
const local=e=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};
canvas.addEventListener('pointerdown',e=>{if(studio?.pointerDown(e))return;const p=local(e),x=(p.x-offset.x)/scale,y=(p.y-offset.y)/scale;let pan=tool==='pan'||e.button===1||e.buttons===4;if(!pan){selected=doc.categories.findLastIndex(c=>x>=c.x_position&&x<=c.x_position+(isTextCategory(c)?Math.max(12,[...c.category_name].length*doc.exportSettings.runAdvance):c.width)&&y>=c.y_position&&y<=c.y_position+(isTextCategory(c)?18:c.height));pan=selected<0;}drag={start:p,offset:{...offset},pan,changed:false,cat:selected>=0?{...doc.categories[selected]}:null};canvas.setPointerCapture(e.pointerId);sync();});
canvas.addEventListener('pointermove',e=>{if(studio?.pointerMove(e))return;if(!drag)return;const p=local(e),dx=p.x-drag.start.x,dy=p.y-drag.start.y;if(!drag.changed&&Math.abs(dx)+Math.abs(dy)>2){if(!drag.pan)remember();drag.changed=true;}if(!drag.changed)return;if(drag.pan)offset={x:drag.offset.x+dx,y:drag.offset.y+dy};else{const c=doc.categories[selected];c.x_position=drag.cat.x_position+dx/scale;c.y_position=drag.cat.y_position+dy/scale;}render();});
for(const event of ['pointerup','pointercancel'])canvas.addEventListener(event,()=>{if(studio?.pointerUp())return;drag=null;sync();});
canvas.addEventListener('wheel',e=>{e.preventDefault();const p=local(e),old=scale;scale=Math.max(.08,Math.min(5,scale*Math.exp(-e.deltaY*.001)));offset.x=p.x-(p.x-offset.x)*scale/old;offset.y=p.y-(p.y-offset.y)*scale/old;$('zoomLabel').textContent=Math.round(scale*100)+'%';render();},{passive:false});
function fit(){const r=canvas.getBoundingClientRect();scale=Math.max(.08,Math.min((r.width-60)/ARTBOARD.width,(r.height-70)/ARTBOARD.height));offset={x:(r.width-ARTBOARD.width*scale)/2,y:(r.height-ARTBOARD.height*scale)/2};render();$('zoomLabel').textContent=Math.round(scale*100)+'%';}
function download(name,text,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function loadImage(src){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Не удалось прочитать изображение'));im.src=src;});}
async function receive(file){
  if(file.size>24*1024*1024)throw Error('Максимальный размер файла: 24 МБ');
  if(/\.(ttf|otf)$/i.test(file.name)){const buffer=await file.arrayBuffer();fontCoverage(buffer);const record={name:file.name,data:encodeFont(new Uint8Array(buffer))};await useFont(record,revision);remember();doc.font=record;sync();return;}
  if(/\.(png|jpe?g|webp)$/i.test(file.name)||file.type.startsWith('image/')){
    const safeFile=/\.svg$/i.test(file.name)||file.type==='image/svg+xml'?new Blob([sanitizeSvg(await file.text())],{type:'image/svg+xml'}):file;
    const url=URL.createObjectURL(safeFile);let img;try{img=await loadImage(url);}finally{URL.revokeObjectURL(url);}
    const t=document.createElement('canvas'),ratio=Math.min(1,1400/Math.max(img.width,img.height));t.width=Math.max(1,Math.round(img.width*ratio));t.height=Math.max(1,Math.round(img.height*ratio));t.getContext('2d').drawImage(img,0,0,t.width,t.height);
    remember();revision++;cancelConversion();doc.image=t.toDataURL('image/png');sourceImage=await loadImage(doc.image);$('imageInfo').textContent=`${file.name} · ${img.width} × ${img.height}`;notify('Изображение загружено. Нажмите «Преобразовать».');sync();return;
  }
  const text=await file.text();let next;try{next=file.name.toLowerCase().endsWith('.dotagrid')?parseProject(text):importDota(text);}catch(e){if(!file.name.toLowerCase().endsWith('.dotagrid')){studio.offerRecovery(text);return;}throw e;}remember();await restore(next);notify('Открыт '+file.name);
}
async function useFont(record,own){
  if(!record){if(loadedFont)document.fonts.delete(loadedFont);loadedFont=null;coverage=null;$('fontStatus').textContent='Fallback font — превью отличается от Dota.';return;}
  const buffer=decodeFont(record.data),has=fontCoverage(buffer),face=new FontFace('StudioRadiance',buffer);await face.load();if(own!==revision)return;
  if(loadedFont)document.fonts.delete(loadedFont);loadedFont=face;coverage=has;document.fonts.add(face);$('fontStatus').textContent=`${record.name} · glyph coverage из cmap; проверьте baseline в Dota`;
}
const converterIds=['mode','quality','threshold','brightness','contrast','characters','blur','noise','sampling','angleOffset','backgroundTolerance','edgeMethod'];
const exportIds=['xOffset','yOffset','horizontalSpacing','verticalSpacing','baselineOffset','runAdvance','budget'];
function writeControls(){$('removeBackground').checked=!!doc.settings.removeBackground;for(const id of converterIds)if(doc.settings[id]!==undefined)$(id).value=doc.settings[id];$('simplify').checked=doc.settings.simplify!==false;$('imageAspect').checked=doc.settings.preserveAspect!==false;for(const id of exportIds)$(id).value=doc.exportSettings[id];$('exportArt').checked=doc.exportSettings.enabled;$('exportMode').value=doc.exportSettings.mode;$('preserveAspect').checked=doc.exportSettings.preserveAspect;$('asciiFallback').checked=doc.exportSettings.asciiFallback;$('thresholdValue').value=$('threshold').value;$('budgetPreset').value=['400','1200','3000','6000'].includes(String(doc.exportSettings.budget))?String(doc.exportSettings.budget):'custom';}
function changeExport(){const next={...doc.exportSettings,enabled:$('exportArt').checked,mode:$('exportMode').value,preserveAspect:$('preserveAspect').checked,asciiFallback:$('asciiFallback').checked};for(const id of exportIds)next[id]=Number($(id).value);const valid=normalizeExport(next);remember();doc.exportSettings=valid;if(valid.preserveAspect)$('verticalSpacing').value=valid.verticalSpacing;sync();}
for(const id of [...exportIds,'exportArt','exportMode','preserveAspect','asciiFallback'])$(id).onchange=guard(changeExport);
$('budgetPreset').onchange=guard(()=>{if($('budgetPreset').value!=='custom'){$('budget').value=$('budgetPreset').value;changeExport();}});
$('alignRuns').onclick=guard(()=>{if(!doc.art.length)throw Error('Сначала преобразуйте изображение');const step=doc.art.find(a=>a.cellWidth)?.cellWidth;if(!step)throw Error('Этот рисунок не содержит данных о шагах ячеек');$('horizontalSpacing').value=doc.exportSettings.runAdvance/step;changeExport();notify('Интервалы подогнаны. Сверьте Text runs и Per glyph в Dota Export Preview.');});
$('optimizeExport').onclick=guard(()=>{const before=exportReport(doc,{...runtimeOptions(),mode:'glyph',dedupe:false});remember();doc.exportSettings.mode='auto';doc.exportSettings.dedupe=true;doc.exportSettings.precision=3;writeControls();sync();notify(`${before.symbols} symbols · ${before.categories.length} → ${report.categories.length} categories · Reduction ${report.reduction.toFixed(1)}%. Для дальнейшего уменьшения: sampling и noise в конвертере.`);});
$('symbolSet').onchange=()=>{$('characters').value=SYMBOL_SETS[$('symbolSet').value];};
for(const [input,button] of [['imageInput','dropImage'],['fileInput','open'],['fontInput','loadFont']]){$(input).onchange=guard(async e=>{const file=e.target.files[0];if(file)await receive(file);e.target.value='';});$(button).onclick=()=>$(input).click();}
// A label already activates its associated file input; do not recursively click it.
$('dropImage').onclick=null;
document.addEventListener('dragover',e=>e.preventDefault());document.addEventListener('drop',guard(async e=>{e.preventDefault();if(e.dataTransfer.files[0])await receive(e.dataTransfer.files[0]);}));
$('convert').onclick=guard(()=>{
  if(!sourceImage)throw Error('Сначала добавьте изображение');if(doc.layers.find(l=>l.id===doc.activeLayer)?.locked)throw Error('Слой заблокирован');const layer=doc.activeLayer;cancelConversion();const options={};for(const id of converterIds)options[id]=['mode','quality','characters','edgeMethod'].includes(id)?$(id).value:Number($(id).value);options.simplify=$('simplify').checked;options.preserveAspect=$('imageAspect').checked;options.removeBackground=$('removeBackground').checked;options.regions=structuredClone(doc.regions);
  const t=document.createElement('canvas');t.width=sourceImage.width;t.height=sourceImage.height;const c=t.getContext('2d',{willReadFrequently:true});c.drawImage(sourceImage,0,0);const pixels=c.getImageData(0,0,t.width,t.height).data,own=revision;
  const worker=new Worker(new URL('./converter-worker.mjs',import.meta.url),{type:'module'});conversion=worker;$('convert').disabled=true;notify('Обрабатываю изображение…');
  worker.onmessage=({data})=>{worker.terminate();if(conversion!==worker)return;conversion=null;$('convert').disabled=false;if(own!==revision)return;if(data.error){notify(data.error,true);return;}remember();doc.art=[...doc.art.filter(a=>a.layer!==layer),...data.art.map(a=>({...a,layer}))];delete options.regions;doc.settings=options;sync();notify(`Создано ${doc.art.length} символов → ${report?.categories.length??0} текстовых категорий. Экспорт готов; поведение glyph проверьте калибровкой в игре.`);};
  worker.onerror=e=>{worker.terminate();conversion=null;$('convert').disabled=false;notify(e.message||'Worker failed',true);};worker.postMessage({id:own,pixels,width:t.width,height:t.height,options},[pixels.buffer]);
});
$('threshold').oninput=()=>$('thresholdValue').value=$('threshold').value;
$('name').onchange=()=>{remember();doc.name=$('name').value;sync();};$('addCategory').onclick=()=>{remember();doc.categories.push(category());selected=doc.categories.length-1;limit=Math.max(limit,selected+1);sync();};$('moreCategories').onclick=()=>{limit+=80;sync();};
$('new').onclick=guard(async()=>{if((doc.categories.length||doc.art.length)&&!confirm('Создать новый проект? Текущий можно сохранить в .dotagrid.'))return;remember();await restore(newDocument());});
$('save').onclick=()=>download((doc.name||'project').replace(/[\\/:*?"<>|]/g,'_')+'.dotagrid',projectJSON(doc));
$('export').onclick=guard(()=>{const out=exportDota(doc,doc.imported,runtimeOptions());download('hero_grid_config.json',JSON.stringify(out,null,2));notify(`Экспортировано ${report.total} категорий текущей сетки, включая ${report.categories.length} из рисунка. Сначала проверьте результат в Dota.`);});
$('calibrate').onclick=guard(async()=>{if((doc.categories.length||doc.art.length)&&!confirm('Открыть отдельную калибровочную сетку? Текущий проект останется в Undo.'))return;remember();const c=calibrationConfig(),next=newDocument();next.name=c.config_name;next.categories=c.categories;await restore(next);$('previewMode').value='dota';fit();notify('Калибровочная сетка готова. Экспортируйте JSON или установите её отдельной сеткой.');});
$('jsonPreview').onclick=guard(()=>{const out=exportDota(doc,doc.imported,runtimeOptions());$('jsonText').textContent=JSON.stringify(out,null,2);$('jsonDialog').showModal();});$('closeJson').onclick=()=>$('jsonDialog').close();
$('undo').onclick=guard(async()=>{if(!history.length)return;future.push(snapshot());await restore(history.pop());});$('redo').onclick=guard(async()=>{if(!future.length)return;history.push(snapshot());await restore(future.pop());});$('fit').onclick=fit;$('grid').onclick=()=>{grid=!grid;$('grid').textContent='Сетка '+(grid?'✓':'');render();};$('previewMode').onchange=render;
for(const [id,value]of[['selectTool','select'],['panTool','pan']])$(id).onclick=()=>{tool=value;$('selectTool').classList.toggle('active',value==='select');$('panTool').classList.toggle('active',value==='pan');};
document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'redo':'undo').click();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();$('redo').click();}if(e.key==='Delete'&&selected>=0&&$('drawTool').value==='categories'){remember();doc.categories.splice(selected,1);selected=-1;sync();}});
async function invoke(command,args){const fn=window.__TAURI__?.core?.invoke;if(!fn)throw Error('Эта функция доступна в Windows-сборке. В браузере используйте Export JSON.');return fn(command,{...args,customRoot:$('steamRoot').value.trim()||null});}
const keep=()=>{const n=Number($('backupKeep').value);if(!Number.isInteger(n)||n<1||n>200)throw Error('Число копий: 1–200');return n;};
$('refreshAccounts').onclick=guard(async()=>{const accounts=await invoke('find_accounts');$('account').replaceChildren(new Option('Выберите Steam аккаунт',''));for(const a of accounts)$('account').add(new Option(`${a.account}${a.exists?'':' · новый файл'} — ${a.path}`,a.path));notify(`Найдено аккаунтов: ${accounts.length}`);});
$('backupHistory').onclick=guard(async()=>{const path=$('account').value;if(!path)throw Error('Выберите Steam аккаунт');const backups=await invoke('list_backups',{path});$('backups').replaceChildren();for(const b of backups)$('backups').add(new Option(`${b.name} · ${Math.ceil(b.bytes/1024)} КБ`,b.name));notify(`Резервных копий: ${backups.length}`);});
$('install').onclick=guard(async()=>{const path=$('account').value;if(!path)throw Error('Выберите Steam аккаунт');const config=currentConfig(doc,runtimeOptions());if(!config.categories.length)throw Error('Добавьте категории или рисунок');const result=await invoke('install_grid',{path,grid:config,keep:keep()});notify(`Установлена сетка «${result.name}»: ${result.categories} категорий. Backup: ${result.backup}`);});
$('restoreBackup').onclick=guard(async()=>{const path=$('account').value,name=$('backups').value;if(!path||!name)throw Error('Выберите аккаунт и копию');if(!confirm('Восстановить весь файл сеток из этой копии? Перед восстановлением будет сохранён текущий файл.'))return;const backup=await invoke('restore_backup',{path,name,keep:keep()});notify('Файл восстановлен. Предыдущее состояние: '+backup);});
ensureEditor(doc);ensureBoards(doc);
studio=createStudio({getDoc:()=>doc,remember,refresh:sync,restore,notify,download,invoke,canvas,getView:()=>({scale,offset}),getTool:()=>tool,getSelected:()=>selected,addCategory:()=>$('addCategory').click(),runtimeOptions,writeControls,fit,render});
window.addEventListener('beforeunload',()=>{cancelConversion();studio.dispose();});new ResizeObserver(resize).observe($('viewport'));writeControls();sync();setTimeout(fit,50);
