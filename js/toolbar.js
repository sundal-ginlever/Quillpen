// ══════════════════════════════════════════
// TOOLBAR + STATUS BAR
// ══════════════════════════════════════════
import { state, camera, currentUser, currentCanvasId, currentCanvasName, setCurrentCanvasName, setTheme, targetCamera, setTargetCamera } from './state.js';
import { zoomAt, fitToAll, startCameraLoop } from './camera.js';
import { drawGrid } from './grid.js';
import { toggleMinimap } from './minimap.js';
import { sb } from './supabase.js';
import { flushToCloud, setSyncState, save } from './sync.js';
import { openShareModal } from './share.js';
import { openExportModal } from './export.js';
import { openHelpModal } from './help.js';
import { sanitize } from './utils.js';

export const TOOLS = [
  {id:'select',label:'선택',icon:'↖',key:'V'},
  {id:'hand',label:'이동',icon:'✋',key:'H'},
  {id:'memo',label:'메모',icon:'📝',key:'M'},
  {id:'sketch',label:'스케치',icon:'✏️',key:'S'},
  {id:'spreadsheet',label:'스프레드시트',icon:'⊞',key:'T'},
  {id:'image',label:'이미지',icon:'🖼',key:'I'}
];
export function buildToolbar(){
  const tb=document.getElementById('toolbar');if(!tb)return;
  tb.style.cssText='position:absolute;top:20px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:4px;background:var(--header-bg);backdrop-filter:blur(12px);border-radius:16px;padding:6px 10px;box-shadow:var(--shadow-lg);border:1px solid var(--border-color);z-index:100;user-select:none;transition:background 0.3s, border-color 0.3s';
  tb.innerHTML='';
  
  TOOLS.forEach(t=>{
    const btn=document.createElement('button');
    btn.className='tool-btn'+(state.activeTool===t.id?' active':'');
    btn.title=`${t.label} (${t.key})`;
    btn.textContent=t.icon;
    btn.addEventListener('click',()=>setTool(t.id));
    tb.appendChild(btn);
  });

  const sep=()=>{
    const d=document.createElement('div');
    d.style.cssText='width:1px;height:24px;background:var(--border-color);margin:0 4px';
    return d;
  };
  
  tb.appendChild(sep());
  const zm=document.createElement('button');zm.className='icon-btn';zm.style.cssText='width:28px;height:28px;border-radius:6px;font-size:16px';zm.textContent='−';zm.title='Zoom Out (Ctrl+-)';zm.addEventListener('click',()=>zoomAt(window.innerWidth/2,window.innerHeight/2,0.8,true));tb.appendChild(zm);
  const zl=document.createElement('span');zl.id='zoom-label';zl.style.cssText='font-size:12px;color:var(--app-text-muted);min-width:42px;text-align:center;cursor:pointer;font-family:monospace;font-weight:600';zl.textContent=Math.round(camera.zoom*100)+'%';zl.addEventListener('click',()=>{setTargetCamera({x:0,y:0,zoom:1});startCameraLoop();});tb.appendChild(zl);
  const zp=document.createElement('button');zp.className='icon-btn';zp.style.cssText='width:28px;height:28px;border-radius:6px;font-size:16px';zp.textContent='+';zp.title='Zoom In (Ctrl+=)';zp.addEventListener('click',()=>zoomAt(window.innerWidth/2,window.innerHeight/2,1.25,true));tb.appendChild(zp);
  const ft=document.createElement('button');ft.className='icon-btn';ft.style.cssText='width:28px;height:28px;border-radius:6px;font-size:14px;margin-left:4px';ft.textContent='⛶';ft.title='화면에 맞춤 (Ctrl+9)';ft.addEventListener('click',()=>fitToAll());tb.appendChild(ft);
  
  tb.appendChild(sep());
  const thm=document.createElement('button');thm.className='icon-btn';thm.style.cssText='width:32px;height:32px;border-radius:8px;font-size:16px;display:flex;align-items:center;justify-content:center';thm.textContent=state.theme==='dark'?'☀️':'🌙';thm.title='테마 토글';thm.addEventListener('click',()=>{setTheme(state.theme==='dark'?'light':'dark');buildToolbar();drawGrid();});tb.appendChild(thm);
  const snp=document.createElement('button');snp.style.cssText=`width:36px;height:36px;border-radius:8px;font-size:13px;border:${state.snapOn?'2px solid var(--accent)':'1px solid var(--border-color)'};background:${state.snapOn?'var(--accent-bg)':'var(--surface)'};color:${state.snapOn?'var(--accent)':'var(--app-text-dim)'};cursor:pointer`;snp.textContent='⊹';snp.title='격자 스냅 토글';snp.addEventListener('click',()=>{state.snapOn=!state.snapOn;buildToolbar();save();});tb.appendChild(snp);
  const gb=document.createElement('button');gb.style.cssText=`width:36px;height:36px;border-radius:8px;font-size:14px;border:${state.showGrid?'2px solid var(--accent)':'1px solid var(--border-color)'};background:${state.showGrid?'var(--accent-bg)':'var(--surface)'};color:${state.showGrid?'var(--accent)':'var(--app-text-dim)'};cursor:pointer`;gb.textContent='⊞';gb.title='그리드 토글';gb.addEventListener('click',()=>{state.showGrid=!state.showGrid;drawGrid();buildToolbar();save();});tb.appendChild(gb);

  tb.appendChild(sep());
  const nameInput = document.createElement('input');
  nameInput.className = 'canvas-name-edit';
  nameInput.value = currentCanvasName;
  nameInput.title = '클릭해서 이름 편집';
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') nameInput.blur(); e.stopPropagation(); });
  nameInput.addEventListener('blur', async () => {
    const nv = nameInput.value.trim();
    if (!nv || nv === currentCanvasName) { nameInput.value = currentCanvasName; return; }
    currentCanvasName = nv; document.title = `inkcanvas — ${nv}`;
    if (typeof sb !== 'undefined' && sb && currentCanvasId && currentCanvasId !== 'local') await sb.from('q_canvases').update({ name: nv }).eq('id', currentCanvasId);
  });
  tb.appendChild(nameInput);

  tb.appendChild(sep());
  const shareBtn = document.createElement('button');shareBtn.className='icon-btn';shareBtn.style.padding='0 10px';shareBtn.style.width='auto';shareBtn.style.fontSize='12px';shareBtn.innerHTML='🔗 공유';shareBtn.title='공유 링크';shareBtn.addEventListener('click',()=> openShareModal());tb.appendChild(shareBtn);
  const expBtn = document.createElement('button');expBtn.className='icon-btn';expBtn.style.padding='0 10px';expBtn.style.width='auto';expBtn.style.fontSize='12px';expBtn.innerHTML='💾 Export';expBtn.title='내보내기';expBtn.addEventListener('click',()=> openExportModal());tb.appendChild(expBtn);
  const helpBtn = document.createElement('button');helpBtn.className='icon-btn';helpBtn.style.width='32px';helpBtn.style.height='32px';helpBtn.innerHTML='❓';helpBtn.title='도움말';helpBtn.addEventListener('click',()=> openHelpModal());tb.appendChild(helpBtn);
  
  tb.appendChild(sep());
  const mapBtn = document.createElement('button');
  mapBtn.className = 'tool-btn' + (state.minimapVisible ? ' active' : '');
  mapBtn.style.width = '36px'; mapBtn.style.height = '36px';
  mapBtn.innerHTML = '🗺️';
  mapBtn.title = '미니맵 토글 (Ctrl+M)';
  mapBtn.addEventListener('click', toggleMinimap);
  tb.appendChild(mapBtn);

  if (window._appModules?.hasInstallPrompt && window._appModules.hasInstallPrompt()) {
    const installBtn = document.getElementById('install-btn');
    if (installBtn) { installBtn.classList.add('visible'); tb.appendChild(installBtn); }
  }

  // logout / account btn
  if(currentUser){
    tb.appendChild(sep());
    const ab=document.createElement('button');
    ab.style.cssText='height:36px;padding:0 10px;border-radius:8px;font-size:11px;border:1px solid rgba(0,0,0,.1);background:white;color:#64748b;cursor:pointer;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    ab.textContent=currentUser.email?.split('@')[0]||'계정';
    ab.title='클릭: 로그아웃';
    ab.addEventListener('click',async()=>{
      if(confirm('로그아웃 하시겠습니까?')){
        // BUG FIX: Flush pending changes before sign out
        setSyncState('syncing', '로그아웃 전 저장 중...');
        await flushToCloud();
        await sb.auth.signOut();
        location.reload();
      }
    });
    tb.appendChild(ab);
  }
}

export function setTool(t){
  state.activeTool=t;buildToolbar();
  const lbl=document.getElementById('tool-label');if(!lbl)return;
  if(t==='select'){lbl.style.display='none';}
  else{const info=TOOLS.find(x=>x.id===t);lbl.style.cssText='position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:#6366f1;color:white;border-radius:20px;padding:6px 16px;font-size:12px;font-weight:600;z-index:100;box-shadow:0 4px 16px rgba(99,102,241,.4);pointer-events:none';lbl.textContent=`${info?.label} 도구 활성`;lbl.style.display='block';}
}

export function updateStatusBar(){
  const sb2=document.getElementById('statusbar');if(!sb2)return;
  const cnt=Object.keys(state.widgets).length,zp=Math.round(camera.zoom*100);
  sb2.style.cssText='position:absolute;bottom:20px;left:20px;background:var(--header-bg);backdrop-filter:blur(10px);border-radius:10px;padding:6px 14px;box-shadow:var(--shadow);border:1px solid var(--border-color);font-size:11px;color:var(--app-text-muted);font-family:monospace;z-index:100;display:flex;gap:14px;align-items:center';
  const tipMap={select:'Del=삭제 · Shift+클릭=다중선택',hand:'드래그로 캔버스 이동',memo:'드래그로 메모 생성',sketch:'드래그로 스케치 생성',spreadsheet:'드래그로 표 생성',image:'드래그로 이미지 생성'};
  const tip = tipMap[state.activeTool] || '';
  sb2.innerHTML=`<span style="color:var(--accent);font-weight:700">INKCANVAS</span><span style="opacity:0.6">|</span><span style="color:#475569">${cnt} Widgets</span><span style="color:#475569">Zoom ${zp}%</span><span style="opacity:0.6">|</span><span style="color:#6366f1">${sanitize(tip)}</span>`;
}