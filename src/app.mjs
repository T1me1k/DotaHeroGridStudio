import { ARTBOARD, category, exportDota, importDota, newDocument, parseProject, projectJSON } from './core.mjs';
import { convertPixels } from './converter.mjs';
const $ = id => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d');
let doc = newDocument(), selected = -1, tool = 'select', grid = true, scale = .57, offset = { x: 80, y: 100 }, drag = null, sourceImage = null, history = [], future = [];
const notify = (message, error = false) => { $('message').textContent = message; $('message').style.color = error ? '#ff9f9f' : '#a9c9e7'; $('status').textContent = message.split('\n')[0]; };
function remember() { history.push(JSON.stringify(doc)); if (history.length > 40) history.shift(); future = []; }
function restore(value) { doc = JSON.parse(value); selected = -1; sourceImage = null; if (doc.image) loadImage(doc.image).then(img => { sourceImage = img; render(); }); sync(); }
function sync() {
  $('name').value = doc.name; $('categoryList').replaceChildren();
  doc.categories.forEach((c, i) => { const item = document.createElement('div'); item.className = 'cat' + (i === selected ? ' selected' : ''); item.innerHTML = `<strong></strong><small></small>`; item.querySelector('strong').textContent = c.category_name; item.querySelector('small').textContent = `${c.hero_ids.length} героев · ${Math.round(c.x_position)}, ${Math.round(c.y_position)}`; item.onclick = () => { selected = i; sync(); }; $('categoryList').append(item); });
  const c = doc.categories[selected];
  $('inspector').innerHTML = c ? `<div class="inspectorGrid"><label class="full">Название<input data-key="category_name" type="text"></label><label>X<input data-key="x_position" type="number" step="1"></label><label>Y<input data-key="y_position" type="number" step="1"></label><label>Ширина<input data-key="width" type="number" min="0"></label><label>Высота<input data-key="height" type="number" min="0"></label><label class="full">ID героев через запятую<input data-key="hero_ids" type="text"></label></div><button id="deleteCategory" class="wide">Удалить категорию</button>` : 'Выберите категорию на холсте или в списке.';
  if (c) {
    for (const input of $('inspector').querySelectorAll('[data-key]')) {
      const key = input.dataset.key; input.value = Array.isArray(c[key]) ? c[key].join(', ') : c[key];
      input.onchange = () => { let value = input.value; if (key === 'hero_ids') { value = value.split(/[,\s]+/).filter(Boolean).map(Number); if (value.some(v => !Number.isInteger(v) || v < 1)) { notify('ID героев должны быть положительными целыми числами', true); return; } } else if (input.type === 'number') { value = Number(value); if (!Number.isFinite(value) || (['width', 'height'].includes(key) && value < 0)) return; } remember(); c[key] = value; sync(); };
    }
    $('deleteCategory').onclick = () => { remember(); doc.categories.splice(selected, 1); selected = -1; sync(); };
  }
  $('empty').hidden = !!(doc.categories.length || doc.art.length || doc.image);
  $('stats').textContent = `${doc.categories.length} категорий · ${doc.art.length} символов · ~${Math.round(JSON.stringify(exportDota(doc)).length / 1024)} КБ JSON`;
  $('zoomLabel').textContent = Math.round(scale * 100) + '%'; render();
}
function resize() { const r = canvas.getBoundingClientRect(), dpr = devicePixelRatio || 1; canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); render(); }
function render() {
  const w = canvas.clientWidth, h = canvas.clientHeight; ctx.clearRect(0, 0, w, h); ctx.save(); ctx.translate(offset.x, offset.y); ctx.scale(scale, scale);
  ctx.fillStyle = '#172334'; ctx.strokeStyle = '#526a86'; ctx.lineWidth = 2 / scale; ctx.fillRect(0, 0, ARTBOARD.width, ARTBOARD.height); ctx.strokeRect(0, 0, ARTBOARD.width, ARTBOARD.height);
  if (grid) { ctx.beginPath(); ctx.strokeStyle = '#2d4055'; ctx.lineWidth = .7 / scale; for(let x=0;x<ARTBOARD.width;x+=50){ctx.moveTo(x,0);ctx.lineTo(x,ARTBOARD.height)} for(let y=0;y<ARTBOARD.height;y+=50){ctx.moveTo(0,y);ctx.lineTo(ARTBOARD.width,y)} ctx.stroke(); }
  if(sourceImage){ctx.globalAlpha=.17;ctx.drawImage(sourceImage,0,0,ARTBOARD.width,ARTBOARD.height);ctx.globalAlpha=1;}
  ctx.fillStyle='#b9d9f0'; ctx.textAlign='center';ctx.textBaseline='middle';
  for (const a of doc.art) { ctx.font=`${a.size || 13}px monospace`;ctx.fillText(a.symbol,a.x,a.y); }
  doc.categories.forEach((c,i)=>{ctx.fillStyle=i===selected?'#2e81ce55':'#28476878';ctx.strokeStyle=i===selected?'#78c5ff':'#7c9fbf';ctx.lineWidth=(i===selected?2:1)/scale;ctx.fillRect(c.x_position,c.y_position,c.width,c.height);ctx.strokeRect(c.x_position,c.y_position,c.width,c.height);ctx.font='17px system-ui';ctx.textAlign='left';ctx.fillStyle='#e5f1fb';ctx.fillText(c.category_name,c.x_position+9,c.y_position+17);ctx.font='12px system-ui';ctx.fillStyle='#a5b9cb';ctx.fillText(`${c.hero_ids.length} heroes`,c.x_position+9,c.y_position+39);});ctx.restore();
}
const world = e => {const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left-offset.x)/scale,y:(e.clientY-r.top-offset.y)/scale};};
canvas.addEventListener('pointerdown',e=>{ const p=world(e); if(tool==='select'){selected=doc.categories.findLastIndex(c=>p.x>=c.x_position&&p.x<=c.x_position+c.width&&p.y>=c.y_position&&p.y<=c.y_position+c.height);if(selected>=0)remember();}drag={pointer:{x:e.clientX,y:e.clientY},last:p,moved:false};canvas.setPointerCapture(e.pointerId);sync();});
canvas.addEventListener('pointermove',e=>{if(!drag)return;const p=world(e),dx=p.x-drag.last.x,dy=p.y-drag.last.y;if(Math.abs(e.clientX-drag.pointer.x)+Math.abs(e.clientY-drag.pointer.y)>2)drag.moved=true;if(tool==='pan'||selected<0){offset.x+=dx*scale;offset.y+=dy*scale;}else {const c=doc.categories[selected];c.x_position+=dx;c.y_position+=dy;}drag.last=p;render();});
canvas.addEventListener('pointerup',()=>{if(drag?.moved)sync();drag=null;});
canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top,old=scale;scale=Math.max(.12,Math.min(3,scale*Math.exp(-e.deltaY*.001)));offset.x=mx-(mx-offset.x)*scale/old;offset.y=my-(my-offset.y)*scale/old;sync();},{passive:false});
function fit(){const r=canvas.getBoundingClientRect();scale=Math.min((r.width-80)/ARTBOARD.width,(r.height-90)/ARTBOARD.height);offset={x:(r.width-ARTBOARD.width*scale)/2,y:(r.height-ARTBOARD.height*scale)/2};sync();}
function download(name,text,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function loadImage(src){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Невозможно прочитать изображение'));im.src=src;});}
async function receive(file){try {if(/\.(png|jpe?g|webp)$/i.test(file.name)||file.type.startsWith('image/')){if(file.size>20*1024*1024)throw Error('Максимальный размер изображения: 20 МБ');const url=URL.createObjectURL(file);const img=await loadImage(url);const temp=document.createElement('canvas');const ratio=Math.min(1,1400/Math.max(img.width,img.height));temp.width=Math.max(1,Math.round(img.width*ratio));temp.height=Math.max(1,Math.round(img.height*ratio));temp.getContext('2d').drawImage(img,0,0,temp.width,temp.height);URL.revokeObjectURL(url);remember();doc.image=temp.toDataURL('image/png');sourceImage=await loadImage(doc.image);$('imageInfo').textContent=`${file.name} · ${img.width} × ${img.height}`;notify('Изображение готово к конвертации');sync();return;}
  const text=await file.text();remember();restore(file.name.endsWith('.dotagrid')?parseProject(text):importDota(text));notify('Файл открыт: '+file.name);
}catch(error){notify('Ошибка открытия: '+error.message,true);}}
$('imageInput').onchange=e=>e.target.files[0]&&receive(e.target.files[0]);$('fileInput').onchange=e=>e.target.files[0]&&receive(e.target.files[0]);$('open').onclick=()=>$('fileInput').click();$('dropImage').onclick=()=>$('imageInput').click();
document.addEventListener('dragover',e=>e.preventDefault());document.addEventListener('drop',e=>{e.preventDefault();if(e.dataTransfer.files[0])receive(e.dataTransfer.files[0]);});
$('convert').onclick=()=>{if(!sourceImage)return notify('Сначала добавьте изображение',true);const t=document.createElement('canvas');t.width=sourceImage.width;t.height=sourceImage.height;const c=t.getContext('2d',{willReadFrequently:true});c.drawImage(sourceImage,0,0);try{remember();doc.settings={mode:$('mode').value,quality:$('quality').value,threshold:Number($('threshold').value),brightness:Number($('brightness').value),contrast:Number($('contrast').value),characters:$('characters').value};doc.art=convertPixels(c.getImageData(0,0,t.width,t.height).data,t.width,t.height,doc.settings);sync();notify(`Создано ${doc.art.length} символов. Рисунок сохраняется в .dotagrid; Dota JSON пока содержит только категории и героев.`);}catch(error){notify(error.message,true);}};
$('threshold').oninput=()=>$('thresholdValue').value=$('threshold').value;
$('name').onchange=()=>{remember();doc.name=$('name').value;sync();};$('addCategory').onclick=()=>{remember();doc.categories.push(category());selected=doc.categories.length-1;sync();};$('new').onclick=()=>{if((doc.categories.length||doc.art.length)&&!confirm('Создать новый проект? Сохраните текущий проект перед продолжением.'))return;remember();doc=newDocument();sourceImage=null;selected=-1;sync();};
$('save').onclick=()=>download((doc.name||'project').replace(/[\\/:*?"<>|]/g,'_')+'.dotagrid',projectJSON(doc));
$('export').onclick=()=>{try{const output=exportDota(doc);download('hero_grid_config.json',JSON.stringify(output,null,2));notify(`JSON экспортирован: ${output.configs.length} сеток. Рисунок из символов не поддерживается подтверждённой схемой Hero Grid.`);}catch(error){notify(error.message,true);}};
$('undo').onclick=()=>{if(!history.length)return;future.push(JSON.stringify(doc));restore(history.pop());};$('redo').onclick=()=>{if(!future.length)return;history.push(JSON.stringify(doc));restore(future.pop());};$('fit').onclick=fit;$('grid').onclick=()=>{grid=!grid;$('grid').textContent='Сетка '+(grid?'✓':'');render();};
for(const [id,value] of [['selectTool','select'],['panTool','pan']])$(id).onclick=()=>{tool=value;$('selectTool').classList.toggle('active',value==='select');$('panTool').classList.toggle('active',value==='pan');};
document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();$('undo').click();}if((e.ctrlKey||e.metaKey)&&e.key==='y'){e.preventDefault();$('redo').click();}if(e.key==='Delete'&&selected>=0){remember();doc.categories.splice(selected,1);selected=-1;sync();}});
async function invoke(command,args){const fn=window.__TAURI__?.core?.invoke;if(!fn)throw Error('Установка доступна в desktop-сборке Tauri для Windows.');return fn(command,args);}
$('refreshAccounts').onclick=async()=>{try{const accounts=await invoke('find_accounts');$('account').replaceChildren(new Option('Выберите Steam аккаунт',''));for(const a of accounts)$('account').add(new Option(`${a.account} — ${a.path}`,a.path));notify(`Найдено аккаунтов: ${accounts.length}`);}catch(e){notify(String(e),true);}};
$('install').onclick=async()=>{try{const path=$('account').value;if(!path)throw Error('Сначала выберите аккаунт Steam');if(doc.art.length)throw Error('Символы пока не экспортируются в Dota. Установка доступна для сеток с категориями и героями.');if(!doc.categories.length)throw Error('Добавьте хотя бы одну категорию');const result=await invoke('install_grid',{path,grid:currentForInstall()});notify(result);}catch(e){notify(String(e),true);}};
function currentForInstall(){return {config_name:doc.name,categories:doc.categories};}
new ResizeObserver(resize).observe($('viewport'));setTimeout(fit,50);sync();
