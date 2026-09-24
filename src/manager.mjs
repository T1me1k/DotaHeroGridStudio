const KEYS=['name','categories','art','image','font','settings','exportSettings','sourceConfig','layers','activeLayer','regions'];
const id=()=>globalThis.crypto.randomUUID();
export function boardPayload(doc){return Object.fromEntries(KEYS.map(k=>[k,doc[k]===undefined?null:structuredClone(doc[k])]));}
export function ensureBoards(doc){
  if(doc.boards?.length)return doc;
  const template=boardPayload(doc);
  doc.boards=(doc.imported?.configs||[]).map(c=>({id:id(),payload:{...structuredClone(template),name:c.config_name,categories:structuredClone(c.categories),sourceConfig:Object.fromEntries(Object.entries(c).filter(([k])=>k!=='categories')),art:[],image:null,font:null,layers:null,regions:[]}}));
  doc.activeBoardId=id();doc.boards.push({id:doc.activeBoardId,payload:null});doc.imported={...(doc.imported||{version:3}),configs:[]};return doc;
}
export function activateBoard(doc,boardId){ensureBoards(doc);if(boardId===doc.activeBoardId)return;const current=doc.boards.find(b=>b.id===doc.activeBoardId),target=doc.boards.find(b=>b.id===boardId);if(!target?.payload)throw Error('Сетка не найдена');current.payload=boardPayload(doc);Object.assign(doc,target.payload);target.payload=null;doc.activeBoardId=boardId;}
export function addBoard(doc,payload){ensureBoards(doc);if(doc.boards.length>=100)throw Error('Максимум 100 сеток в проекте');const entry={id:id(),payload:structuredClone(payload)};doc.boards.push(entry);activateBoard(doc,entry.id);}
export function deleteBoard(doc){ensureBoards(doc);if(doc.boards.length===1)throw Error('Оставьте хотя бы одну сетку');const old=doc.activeBoardId,next=doc.boards.find(b=>b.id!==old);activateBoard(doc,next.id);doc.boards=doc.boards.filter(b=>b.id!==old);}
export function moveBoard(doc,delta){const i=doc.boards.findIndex(b=>b.id===doc.activeBoardId),j=i+delta;if(j<0||j>=doc.boards.length)return;[doc.boards[i],doc.boards[j]]=[doc.boards[j],doc.boards[i]];}
export function recoverConfigs(text,validate){
  let start=-1,depth=0,quoted=false,escape=false;const candidates=[],stack=[];
  for(let i=0;i<text.length;i++){const ch=text[i];if(quoted){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch==='"')quoted=false;continue;}if(ch==='"'){quoted=true;continue;}if(ch==='{'){stack.push(i);depth++;}if(ch==='}'&&depth){start=stack.pop();depth--;try{const obj=JSON.parse(text.slice(start,i+1));if(typeof obj.config_name==='string'&&Array.isArray(obj.categories)&&!validate({version:3,configs:[obj]}).length)candidates.push(obj);}catch{}}}
  return {version:3,configs:candidates};
}
