import { state } from '../core/state';

export function renderToolbar() {
  const toolbar = document.getElementById('toolbar');
  if (!toolbar) return;

  // Premium Tool Definitions (Restored Icons from Original)
  const tools = [
    { id: 'select', icon: '↖', label: '선택 (V)' },
    { id: 'hand',   icon: '✋', label: '이동 (H)' },
    { id: 'memo',   icon: '📝', label: '메모 (M)' },
    { id: 'sketch', icon: '✏️', label: '스케치 (S)' },
    { id: 'spreadsheet', icon: '📊', label: '표 (T)' },
    { id: 'image',  icon: '🖼️', label: '이미지 (I)' }
  ];

  toolbar.innerHTML = '';
  tools.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'tool-btn' + (state.activeTool === t.id ? ' active' : '');
    btn.innerHTML = t.icon;
    btn.title = t.label;
    btn.onclick = () => {
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeTool = t.id;
      // Emit event for other modules
      window.dispatchEvent(new CustomEvent('toolchanged', { detail: { tool: t.id } }));
    };
    toolbar.appendChild(btn);
  });

  // Action Buttons (Right side)
  const divider = document.createElement('div');
  divider.style.cssText = 'width:1px;height:24px;background:var(--border-dim);margin:0 8px';
  toolbar.appendChild(divider);

  const actions = [
    { id: 'fit', icon: '⛶', label: '전체 보기', click: () => window.dispatchEvent(new Event('fittoall')) },
    { id: 'share', icon: '🔗', label: '공유하기', click: () => document.getElementById('share-modal').style.display = 'flex' }
  ];

  actions.forEach(a => {
    const btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.innerHTML = a.icon;
    btn.title = a.label;
    btn.onclick = a.click;
    toolbar.appendChild(btn);
  });
}
