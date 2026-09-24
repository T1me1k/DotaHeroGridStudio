import {ensureEditor,visibleArt,editableArt,newLayer,brushPoints,addStroke,connectedIds,floodPoints,bounds,transformArt,textArt,fitArt,diffArt} from './editor.mjs';
import {ensureBoards,boardPayload,activateBoard,addBoard,deleteBoard,moveBoard,recoverConfigs} from './manager.mjs';
import {newDocument,parseProject,importDota,parseDota,validateDota,currentConfig,projectJSON,exportReport} from './core.mjs';
import {saveVersion,loadAutosave,loadSnapshots} from './history.mjs';
import {HEROES} from './heroes.mjs';
export function createStudio(api){
 const $=id=>document.getElementById(id),get=api.getDoc;
 const guard=fn=>async(...args)=>{try{await fn(...args);}catch(e){api.notify(e.message||String(e),true);}};
 let selected=new Set(),gesture=null,pen=[],clipboard=[],compare=null,showCompare=false,wizard='logo',snapshots=[],recovery=null,autosaveTimer,ready=false;
 const step=()=>Math.max(4,Math.min(80,Number($('brushStep').value)||12));
 const world=e=>{const r=api.canvas.getBoundingClientRect(),v=api.getView();return{x:(e.clientX-r.left-v.offset.x)/v.scale,y:(e.clientY-r.top-v.offset.y)/v.scale};};
 const chosen=()=>editableArt(get()).filter(a=>selected.has(a.id));
 const hit=p=>editableArt(get()).findLast(a=>Math.hypot(a.x-p.x,a.y-p.y)<=Math.max(step(),a.size||12));
 function checkpoint(fn){api.remember();fn();api.refresh();}
 const mutate=fn=>guard(()=>checkpoint(fn));
 function strokeOptions(){return{step:step(),symbol:$('brushSymbol').value,mirrorX:$('mirrorX').checked,mirrorY:$('mirrorY').checked};}
 function pointerDown(e){
  if($('drawTool').value==='categories'||api.getTool()==='pan'||e.button===1||document.body.classList.contains('simple'))return false;
  if($('previewMode').value==='dota'){$('previewMode').value='editor';api.render();}
  const p=world(e),tool=$('drawTool').value,doc=get();
  try{
   if(tool==='pen'){pen.push(p);if(pen.length===4){checkpoint(()=>addStroke(doc,brushPoints('pen',pen[0],pen[3],step(),pen.slice(1,3)),strokeOptions()));pen=[];}else api.notify(`Bezier: ${pen.length}/4 точки (начало, две управляющие, конец)`);api.render();return true;}
   if(tool==='wand'||tool==='component'){const ids=connectedIds(editableArt(doc),hit(p),step());if(tool==='component')checkpoint(()=>doc.art=doc.art.filter(a=>!ids.has(a.id)));else{selected=ids;api.refresh();}return true;}
   if(tool==='fill'){checkpoint(()=>addStroke(doc,floodPoints(visibleArt(doc),p,step()),strokeOptions()));return true;}
   if(tool==='select'){
    const a=hit(p);if(a){if(!e.shiftKey&&!selected.has(a.id))selected.clear();const group=a.group?editableArt(doc).filter(x=>x.group===a.group):[a];for(const x of group){if(e.shiftKey&&selected.has(x.id))selected.delete(x.id);else selected.add(x.id);}
     gesture={tool:'move',start:p,original:new Map(chosen().map(x=>[x.id,{x:x.x,y:x.y}])),changed:false};
    }else{if(!e.shiftKey)selected.clear();gesture={tool:'marquee',start:p,end:p};}
   }else gesture={tool,start:p,end:p,points:[],changed:false};
   api.canvas.setPointerCapture(e.pointerId);api.render();return true;
  }catch(error){api.notify(error.message,true);return true;}
 }
 function pointerMove(e){if(!gesture)return false;const p=world(e);gesture.end=p;
  if(gesture.tool==='move'){const dx=p.x-gesture.start.x,dy=p.y-gesture.start.y;if(!gesture.changed&&Math.hypot(dx,dy)>1){api.remember();gesture.changed=true;}if(gesture.changed)for(const a of chosen()){const original=gesture.original.get(a.id);if(!original)continue;const round=v=>$('snap').checked?Math.round(v/step())*step():v;a.x=round(original.x+dx);a.y=round(original.y+dy);}}
  if(['pencil','brush','eraser'].includes(gesture.tool)){const previous=gesture.points.at(-1)||gesture.start;gesture.points.push(...brushPoints('line',previous,p,step()));}
  api.render();return true;
 }
 function pointerUp(){if(!gesture)return false;const g=gesture;gesture=null;const doc=get();try{
  if(g.tool==='move'){api.refresh();return true;}
  if(g.tool==='marquee'){const loX=Math.min(g.start.x,g.end.x),hiX=Math.max(g.start.x,g.end.x),loY=Math.min(g.start.y,g.end.y),hiY=Math.max(g.start.y,g.end.y);for(const a of editableArt(doc))if(a.x>=loX&&a.x<=hiX&&a.y>=loY&&a.y<=hiY)selected.add(a.id);api.refresh();return true;}
  checkpoint(()=>{
   if(g.tool==='region'){if(doc.regions.length>=8)throw Error('Максимум 8 областей');const r={id:crypto.randomUUID(),x:Math.min(g.start.x,g.end.x),y:Math.min(g.start.y,g.end.y),width:Math.abs(g.end.x-g.start.x),height:Math.abs(g.end.y-g.start.y),settings:{mode:'line',quality:'balanced',threshold:70,density:1}};if(r.width>=5&&r.height>=5)doc.regions.push(r);return;}
   const points=['pencil','brush','eraser'].includes(g.tool)?g.points.length?g.points:[g.start]:brushPoints(g.tool,g.start,g.end,step());
   if(g.tool==='eraser'){const ids=new Set(editableArt(doc).filter(a=>points.some(p=>Math.hypot(p.x-a.x,p.y-a.y)<=step())).map(a=>a.id));doc.art=doc.art.filter(a=>!ids.has(a.id));}
   else addStroke(doc,points,strokeOptions());
  });
 }catch(e){api.notify(e.message,true);}return true;}
 function renderOverlay(ctx,zoom){
  const doc=get();ctx.save();ctx.lineWidth=1/zoom;
  if(showCompare&&compare&&$('previewMode').value!=='dota'){const diff=diffArt(compare.art,visibleArt(doc));ctx.font='16px monospace';ctx.textBaseline='top';for(const [items,color]of[[diff.removed,'#ff85ae'],[diff.added,'#73f4ac']]){ctx.fillStyle=color;for(const a of items)ctx.fillText(a.symbol,a.x,a.y);}}
  if($('previewMode').value==='dota'){ctx.restore();return;}
  if($('guides').checked){ctx.strokeStyle='#bb8ded';ctx.setLineDash([6/zoom,6/zoom]);ctx.beginPath();ctx.moveTo(596.739,0);ctx.lineTo(596.739,600);ctx.moveTo(0,300);ctx.lineTo(1193.478,300);ctx.stroke();ctx.setLineDash([]);}
  ctx.strokeStyle='#e8bd6a';for(const r of doc.regions){ctx.strokeRect(r.x,r.y,r.width,r.height);}
  const b=bounds(chosen());if(b){ctx.strokeStyle='#6fcefa';ctx.strokeRect(b.x-3,b.y-3,b.width+18,b.height+20);}
  if(gesture&&gesture.tool!=='move'){
   const g=gesture;ctx.strokeStyle='#6fcefa';if(['marquee','region'].includes(g.tool))ctx.strokeRect(g.start.x,g.start.y,g.end.x-g.start.x,g.end.y-g.start.y);
   else{const pts=['pencil','brush','eraser'].includes(g.tool)?g.points:brushPoints(g.tool,g.start,g.end,step());ctx.fillStyle='#7bcfff';for(const p of pts)ctx.fillRect(p.x,p.y,3/zoom,3/zoom);}
  }
  if(pen.length){ctx.beginPath();ctx.moveTo(pen[0].x,pen[0].y);for(const p of pen)ctx.lineTo(p.x,p.y);ctx.strokeStyle='#aaccff';ctx.stroke();}
  ctx.restore();
 }
 async function refreshHistory(){snapshots=(await loadSnapshots()).sort((a,b)=>b.time-a.time);$('snapshotList').replaceChildren(...snapshots.map(s=>new Option(`${s.name} · ${new Date(s.time).toLocaleString()}`,s.id)));}
 function scheduleAutosave(){if(!ready)return;clearTimeout(autosaveTimer);autosaveTimer=setTimeout(guard(async()=>{await saveVersion(projectJSON(get()),'Autosave',true);$('autosaveStatus').textContent='Autosave: '+new Date().toLocaleTimeString();}),1600);}
 function sync(){
  const doc=get();ensureEditor(doc);ensureBoards(doc);
  $('artSelection').textContent=`${chosen().length} выделено · ${visibleArt(doc).length} видно`;
  $('boardList').replaceChildren(...doc.boards.map(b=>new Option(b.id===doc.activeBoardId?doc.name:b.payload.name,b.id)));$('boardList').value=doc.activeBoardId;
  $('layerList').replaceChildren(...doc.layers.map(l=>new Option(`${l.visible?'◉':'○'} ${l.locked?'🔒 ':''}${l.name}`,l.id)));$('layerList').value=doc.activeLayer;$('layerName').value=doc.layers.find(l=>l.id===doc.activeLayer)?.name||'';
  const selectedRegion=$('regionList').value;$('regionList').replaceChildren(...doc.regions.map((r,i)=>new Option(`Region ${i+1} · ${Math.round(r.width)}×${Math.round(r.height)}`,r.id)));if(doc.regions.some(r=>r.id===selectedRegion))$('regionList').value=selectedRegion;
  if(showCompare&&compare){const diff=diffArt(compare.art,visibleArt(doc));let count=0;try{count=exportReport(doc).total;}catch{}$('compareStats').textContent=`A: ${compare.categories} categories → B: ${count}; +${diff.added.length} / −${diff.removed.length} glyphs. Зелёный: добавлено; розовый: удалено.`;}
  scheduleAutosave();
 }
 $('uiMode').onclick=()=>{const simple=document.body.classList.toggle('simple');$('uiMode').textContent=simple?'Advanced Mode':'Simple Mode';setTimeout(api.fit,0);};
 $('drawTool').onchange=()=>{pen=[];selected.clear();api.render();};$('guides').onchange=api.render;
 $('selectArtAll').onclick=()=>{selected=new Set(editableArt(get()).map(a=>a.id));api.refresh();};
 $('deleteArt').onclick=mutate(()=>{const ids=new Set(chosen().map(a=>a.id));get().art=get().art.filter(a=>!ids.has(a.id));selected.clear();});
 $('copyArt').onclick=()=>{clipboard=structuredClone(chosen());api.notify(`${clipboard.length} символов скопировано внутри редактора`);};
 const paste=()=>{const doc=get();if(doc.layers.find(l=>l.id===doc.activeLayer)?.locked)throw Error('Слой заблокирован');if(doc.art.length+clipboard.length>50000)throw Error('Слишком много символов');const groupMap=new Map();const copies=clipboard.map(a=>{if(a.group&&!groupMap.has(a.group))groupMap.set(a.group,crypto.randomUUID());return{...a,id:crypto.randomUUID(),x:a.x+12,y:a.y+12,layer:doc.activeLayer,group:a.group?groupMap.get(a.group):undefined,locked:false,hidden:false};});doc.art.push(...copies);selected=new Set(copies.map(a=>a.id));};
 $('pasteArt').onclick=mutate(paste);$('duplicateArt').onclick=mutate(()=>{clipboard=structuredClone(chosen());paste();});
 $('groupArt').onclick=mutate(()=>{const group=crypto.randomUUID();for(const a of chosen())a.group=group;});$('ungroupArt').onclick=mutate(()=>{for(const a of chosen())delete a.group;});
 $('lockArt').onclick=mutate(()=>{for(const a of chosen())a.locked=true;selected.clear();});$('hideArt').onclick=mutate(()=>{for(const a of chosen())a.hidden=true;selected.clear();});$('unlockArt').onclick=mutate(()=>{for(const a of get().art)a.locked=false;});$('showArt').onclick=mutate(()=>{for(const a of get().art)a.hidden=false;});
 $('applyTransform').onclick=mutate(()=>{const op=$('transformOp').value,value=Number($('transformValue').value);if(!Number.isFinite(value)||(op==='scale'&&(value<=0||value>20)))throw Error('Неверное значение transform');transformArt(chosen(),op,value);});
 $('fitArt').onclick=mutate(()=>{fitArt(chosen().length?chosen():editableArt(get()));});
 $('layerList').onchange=()=>{get().activeLayer=$('layerList').value;api.refresh();};$('layerName').onchange=mutate(()=>get().layers.find(l=>l.id===get().activeLayer).name=$('layerName').value||'Layer');
 $('layerAdd').onclick=mutate(()=>{const l=newLayer(`Layer ${get().layers.length+1}`);get().layers.push(l);get().activeLayer=l.id;});
 for(const [id,key]of[['layerHide','visible'],['layerLock','locked']])$(id).onclick=mutate(()=>{const l=get().layers.find(l=>l.id===get().activeLayer);l[key]=!l[key];});
 for(const [id,delta]of[['layerUp',-1],['layerDown',1]])$(id).onclick=mutate(()=>{const d=get(),i=d.layers.findIndex(l=>l.id===d.activeLayer),j=i+delta;if(j>=0&&j<d.layers.length)[d.layers[i],d.layers[j]]=[d.layers[j],d.layers[i]];});
 $('layerDelete').onclick=guard(()=>{const d=get();if(d.layers.length===1)throw Error('Оставьте хотя бы один слой');if(d.layers.find(l=>l.id===d.activeLayer).locked)throw Error('Слой заблокирован');if(!confirm('Удалить слой вместе с его рисунком?'))return;checkpoint(()=>{d.art=d.art.filter(a=>a.layer!==d.activeLayer);d.layers=d.layers.filter(l=>l.id!==d.activeLayer);d.activeLayer=d.layers[0].id;});});
 $('moveLayer').onclick=mutate(()=>{if(get().layers.find(l=>l.id===get().activeLayer).locked)throw Error('Слой заблокирован');for(const a of chosen())a.layer=get().activeLayer;});
 const switchAndRestore=async fn=>{api.remember();fn();await api.restore(get());};
 $('boardList').onchange=guard(()=>switchAndRestore(()=>activateBoard(get(),$('boardList').value)));
 $('boardNew').onclick=guard(()=>switchAndRestore(()=>addBoard(get(),boardPayload(newDocument()))));
 $('boardDuplicate').onclick=guard(()=>switchAndRestore(()=>{const p=boardPayload(get());p.name+=' copy';addBoard(get(),p);}));
 $('boardDelete').onclick=guard(async()=>{if(confirm('Удалить текущую сетку из проекта?'))await switchAndRestore(()=>deleteBoard(get()));});
 $('boardUp').onclick=mutate(()=>moveBoard(get(),-1));$('boardDown').onclick=mutate(()=>moveBoard(get(),1));
 $('exportOne').onclick=guard(()=>api.download('hero_grid_config.json',JSON.stringify({version:3,configs:[currentConfig(get(),api.runtimeOptions())]},null,2)));
 $('importMerge').onclick=()=>$('mergeInput').click();$('mergeInput').onchange=guard(async e=>{const f=e.target.files[0];if(!f)return;const root=parseDota(await f.text());api.remember();for(const c of root.configs){const d=newDocument();d.name=c.config_name;d.categories=c.categories;d.sourceConfig={...c};delete d.sourceConfig.categories;addBoard(get(),boardPayload(d));}await api.restore(get());e.target.value='';});
 $('regionList').onchange=()=>{const r=get().regions.find(r=>r.id===$('regionList').value);if(r){$('regionMode').value=r.settings.mode;$('regionQuality').value=r.settings.quality;$('regionThreshold').value=r.settings.threshold;$('regionDensity').value=r.settings.density;}};
 $('regionApply').onclick=mutate(()=>{const r=get().regions.find(r=>r.id===$('regionList').value);if(!r)throw Error('Сначала нарисуйте Region');const density=Number($('regionDensity').value),threshold=Number($('regionThreshold').value);if(density<.25||density>2||threshold<1||threshold>255)throw Error('Проверьте параметры региона');r.settings={mode:$('regionMode').value,quality:$('regionQuality').value,threshold,density};});
 $('regionDelete').onclick=mutate(()=>get().regions=get().regions.filter(r=>r.id!==$('regionList').value));
 $('textArt').onclick=()=>$('textDialog').showModal();$('insertText').onclick=mutate(()=>{const d=get();if(d.layers.find(l=>l.id===d.activeLayer)?.locked)throw Error('Слой заблокирован');const art=textArt($('artText').value,{layer:d.activeLayer,advance:d.exportSettings.runAdvance});if(d.art.length+art.length>50000)throw Error('Слишком большой текст');d.art.push(...art);$('textDialog').close();});
 for(const btn of document.querySelectorAll('[data-close]'))btn.onclick=()=>$(btn.dataset.close).close();
 const wizardOpen=kind=>{wizard=kind;$('wizardTitle').textContent=kind==='logo'?'Logo Wizard':'Pixel Art Wizard · mono';$('wizardDialog').showModal();};$('logoWizard').onclick=()=>wizardOpen('logo');$('pixelWizard').onclick=()=>wizardOpen('pixel');$('wizardUpload').onclick=()=>$('imageInput').click();
 $('wizardTrace').onclick=()=>{$('mode').value=wizard==='logo'?'outline':'pixel';$('quality').value='balanced';$('removeBackground').checked=wizard==='logo';$('simplify').checked=true;$('threshold').value=110;$('convert').click();$('wizardStatus').textContent='Конвертация запущена. После неё нажмите Center + Fit.';};
 $('wizardFit').onclick=mutate(()=>{const d=get();if(!d.art.length)throw Error('Сначала завершите Convert');fitArt(editableArt(d));Object.assign(d.exportSettings,{xOffset:0,yOffset:0,baselineOffset:0,horizontalSpacing:1,verticalSpacing:1});api.writeControls();});$('wizardExport').onclick=()=>{$('wizardDialog').close();$('export').click();};
 function heroes(){const d=get(),c=d.categories[api.getSelected()],q=$('heroSearch').value.toLowerCase();$('heroResults').replaceChildren();for(const h of HEROES.filter(h=>`${h.name} ${h.roles.join(' ')}`.toLowerCase().includes(q))){const b=document.createElement('button');b.className='heroCard'+(c?.hero_ids.includes(h.id)?' selected':'');b.textContent=h.name;const detail=document.createElement('small');detail.textContent=`${h.attribute} · ${h.roles.slice(0,2).join(', ')}`;b.append(detail);b.onclick=()=>{if(!c)return;if(c.hero_ids.includes(h.id))c.hero_ids=c.hero_ids.filter(n=>n!==h.id);else c.hero_ids.push(h.id);if(c.width===0)c.width=300;if(c.height===0)c.height=130;heroes();api.refresh();};$('heroResults').append(b);}}
 $('heroPicker').onclick=()=>{if(api.getSelected()<0){api.addCategory();}api.remember();heroes();$('heroDialog').showModal();};$('heroSearch').oninput=heroes;$('heroDone').onclick=()=>$('heroDialog').close();
 $('saveSnapshot').onclick=guard(async()=>{await saveVersion(projectJSON(get()),get().name);await refreshHistory();api.notify('Snapshot сохранён');});$('restoreSnapshot').onclick=guard(async()=>{const s=snapshots.find(s=>s.id===$('snapshotList').value);if(!s)throw Error('Нет snapshot');api.remember();await api.restore(parseProject(s.json));});$('downloadSnapshot').onclick=()=>{const s=snapshots.find(s=>s.id===$('snapshotList').value);if(s)api.download('snapshot.dotagrid',s.json);};
 $('captureCompare').onclick=()=>{compare={art:structuredClone(visibleArt(get())),categories:exportReport(get()).total};$('compareStats').textContent=`A сохранена: ${compare.art.length} glyphs`;};$('compareToggle').onclick=()=>{if(!compare)return api.notify('Сначала зафиксируйте A',true);showCompare=!showCompare;api.refresh();};
 $('testInstall').onclick=guard(async()=>{const path=$('account').value;if(!path)throw Error('Выберите Steam аккаунт');const grid=currentConfig(get(),api.runtimeOptions());if(!grid.categories.length)throw Error('Пустая сетка');const out=await api.invoke('install_grid',{path,grid,test:true,keep:Number($('backupKeep').value)});api.notify(`DHGS TEST обновлена: ${out.categories} категорий. Backup: ${out.backup}`);});
 $('healthCheck').onclick=guard(async()=>{const result=await api.invoke('health_check',{path:$('account').value||null});$('healthResults').replaceChildren(...result.map(r=>{const line=document.createElement('div');line.className='healthRow';line.textContent=`${r.name} ${r.ok?'✓':'—'} · ${r.detail}`;return line;}));});
 function offerRecovery(raw,path=null){const recovered=recoverConfigs(raw,validateDota);recovery={raw,path,recovered};$('recoveryInfo').textContent=`Найдено читаемых сеток: ${recovered.configs.length}. Оригинал сохраняется отдельно; повреждённые части не восстанавливаются автоматически.`;$('recoverWrite').disabled=!path||!recovered.configs.length;$('recoverOpen').disabled=!recovered.configs.length;$('recoveryDialog').showModal();}
 $('openDota').onclick=guard(async()=>{const path=$('account').value;if(!path)throw Error('Выберите Steam аккаунт');const raw=await api.invoke('read_grid',{path});try{const next=importDota(raw);api.remember();await api.restore(next);}catch{offerRecovery(raw,path);}});
 $('saveDamaged').onclick=()=>api.download('hero_grid_original_damaged.json',recovery.raw);$('recoverOpen').onclick=guard(async()=>{api.remember();await api.restore(importDota(JSON.stringify(recovery.recovered)));$('recoveryDialog').close();});$('recoverWrite').onclick=guard(async()=>{if(!confirm('Записать восстановленные сетки? Исходный повреждённый файл будет сохранён в backup.'))return;const backup=await api.invoke('recover_grid',{path:recovery.path,expected:recovery.raw,recovered:recovery.recovered,keep:Number($('backupKeep').value)});$('recoveryDialog').close();api.notify('Восстановлено. Оригинал: '+backup);});
 document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)||document.querySelector('dialog[open]'))return;if(e.key==='Escape'){pen=[];gesture=null;selected.clear();api.refresh();}if(!['select','wand'].includes($('drawTool').value))return;const cmd=e.ctrlKey||e.metaKey;if(cmd&&['a','c','v','d','g'].includes(e.key.toLowerCase())){e.preventDefault();const key=e.key.toLowerCase();$(key==='a'?'selectArtAll':key==='c'?'copyArt':key==='v'?'pasteArt':key==='d'?'duplicateArt':e.shiftKey?'ungroupArt':'groupArt').click();}if(e.key==='Delete')$('deleteArt').click();});
 const initialized=(async()=>{try{const old=await loadAutosave();if(old){await api.restore(parseProject(old.json));api.notify('Восстановлено локальное автосохранение');}await refreshHistory();}catch(e){api.notify('Autosave недоступно: '+e.message,true);}finally{ready=true;}})();
 return{isDragging:()=>!!gesture,sync,pointerDown,pointerMove,pointerUp,renderOverlay,offerRecovery,initialized,onRestore(){selected.clear();pen=[];gesture=null;},dispose(){clearTimeout(autosaveTimer);}};
}
