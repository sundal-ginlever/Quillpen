// ══════════════════════════════════════════
// SPREADSHEET WIDGET (Jspreadsheet CE v4 Engine)
// ══════════════════════════════════════════
import { state, isReadOnly } from '../state.js';
import { resizeHandleHTML, attachResizeHandle } from '../utils.js';
import { events } from '../events.js';
import { deleteWidget } from './core.js';

/**
 * 기존 Luckysheet 데이터 구조(w.luckyData)로부터 데이터를 유실 없이 2D 배열로 변환하는 마이그레이션 함수
 */
function migrateFromLucky(luckyData) {
  try {
    const firstSheet = Array.isArray(luckyData) ? luckyData[0] : luckyData;
    if (!firstSheet) return null;
    
    // 1. celldata가 존재하는 경우 (희소 행렬 구조)
    if (firstSheet.celldata && Array.isArray(firstSheet.celldata)) {
      const maxRow = Math.max(14, ...firstSheet.celldata.map(c => c.r || 0));
      const maxCol = Math.max(7, ...firstSheet.celldata.map(c => c.c || 0));
      const grid = Array.from({ length: maxRow + 1 }, () => Array(maxCol + 1).fill(''));
      
      firstSheet.celldata.forEach(cell => {
        const val = cell.v && (typeof cell.v === 'object' ? (cell.v.m || cell.v.v || '') : cell.v);
        if (cell.r >= 0 && cell.c >= 0) {
          grid[cell.r][cell.c] = val;
        }
      });
      return grid;
    }
    
    // 2. data 2D 배열이 존재하는 경우
    if (firstSheet.data && Array.isArray(firstSheet.data)) {
      return firstSheet.data.map(row => 
        Array.isArray(row) ? row.map(cell => cell && typeof cell === 'object' ? (cell.m || cell.v || '') : (cell || '')) : []
      );
    }
  } catch (e) {
    console.error("Migration from Luckysheet failed:", e);
  }
  return null;
}

/**
 * Jspreadsheet을 위젯 내부에 렌더링하고 동기화 로직을 연결합니다.
 */
export function renderSpreadsheet(w) {
  // DB에서 w, h 값이 누락되었을 경우 기본값 보장
  const safeW = w.w || 380;
  const safeH = w.h || 260;

  const el = document.createElement('div');
  el.id = 'w-' + w.id;
  el.dataset.widgetId = w.id;
  el.className = 'widget spreadsheet-widget';
  // 100% 확실한 포지셔닝 보장
  el.style.cssText = `position:absolute;left:${w.x}px;top:${w.y}px;width:${safeW}px;height:${safeH}px;background:white;border:1px solid var(--border-color);display:flex;flex-direction:column;overflow:hidden;box-shadow:var(--shadow-lg);border-radius:8px;`;

  // 1. 타이틀바 (드래그용)
  el.innerHTML = `
    <div class="drag-bar" style="height:32px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;padding:0 12px;cursor:move;flex-shrink:0;user-select:none;">
      <span style="font-size:11px;font-weight:600;color:#64748b;font-family:monospace;letter-spacing:0.05em;text-transform:uppercase;">spreadsheet</span>
      <button class="del-btn" style="margin-left:auto;width:20px;height:20px;border-radius:50%;background:#fee2e2;border:none;font-size:12px;color:#ef4444;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s;">×</button>
    </div>
    <div id="lucky-${w.id}" class="jexcel-container-wrapper" style="margin:0;padding:0;position:absolute;width:100%;height:calc(100% - 32px);left:0;top:32px;background:#fff;overflow:auto;${w.locked ? 'pointer-events:none;opacity:0.9;' : ''}">
      <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:12px;">준비 중...</div>
    </div>
    ${resizeHandleHTML()}
  `;

  const luckyContainerId = `lucky-${w.id}`;
  const delBtn = el.querySelector('.del-btn');
  delBtn.addEventListener('pointerdown', e => { e.stopPropagation(); if (isReadOnly) return; if (window._appModules?.snapshotForUndo) window._appModules.snapshotForUndo(); deleteWidget(w.id); });

  // 2. Jspreadsheet 초기화 (재시도 로직 포함)
  let retryCount = 0;
  let initialTimeout = null;
  let retryTimeout = null;
  let jinst = null;

  // 동기식 클린업 정의로 비동기 Race Condition 및 리스너 누수 차단
  el._cleanupFn = () => {
    if (initialTimeout) clearTimeout(initialTimeout);
    if (retryTimeout) clearTimeout(retryTimeout);
    if (w._jexcelSaveTimeout) clearTimeout(w._jexcelSaveTimeout);
    
    try {
      if (jinst && typeof jinst.destroy === 'function') {
        jinst.destroy();
      }
    } catch(e) {}
    
    const luckyDiv = document.getElementById(luckyContainerId);
    if (luckyDiv) luckyDiv.innerHTML = ''; 
  };

  function initJexcel() {
    // 위젯이 DOM에서 파괴되었으면 재시도 중단
    if (!document.getElementById('w-' + w.id)) return;

    const containerEl = document.getElementById(luckyContainerId);
    
    // 1) 위젯이 화면에 붙지 않은 상태면 대기
    if (!containerEl || containerEl.offsetWidth === 0) {
      if (retryCount < 50) {
        retryCount++;
        retryTimeout = setTimeout(initJexcel, 200);
      } else {
        if (containerEl) containerEl.innerHTML = '<div style="padding:20px;color:#ef4444;font-size:12px;">위젯 로드 실패 (크기 계산 오류)</div>';
      }
      return;
    }

    // 2) jspreadsheet 라이브러리가 아직 로드되지 않았으면 대기
    if (typeof jspreadsheet === 'undefined') {
      if (retryCount < 50) { // 최대 10초 대기
        retryCount++;
        retryTimeout = setTimeout(initJexcel, 200);
      } else {
        containerEl.innerHTML = '<div style="padding:20px;color:#ef4444;font-size:12px;">라이브러리 로드 지연 (인터넷 환경을 확인해주세요)</div>';
      }
      return;
    }

    // 데이터 초기 설정 및 마이그레이션 적용
    let initialData = w.jdata;
    if (!initialData && w.luckyData) {
      initialData = migrateFromLucky(w.luckyData);
    }
    if (!initialData || !Array.isArray(initialData) || initialData.length === 0) {
      // 기본 15행 8열 빈 시트
      initialData = Array.from({ length: 15 }, () => Array(8).fill(''));
    }

    // 3번 이슈: 동시 편집 병합을 위한 원본 데이터 백업 복사본 생성
    if (!w._baseJdata) {
      w._baseJdata = JSON.parse(JSON.stringify(initialData));
    }
    
    containerEl.innerHTML = ''; // "준비 중..." 문구 지우기

    try {
      jinst = jspreadsheet(containerEl, {
        data: initialData,
        minDimensions: [8, 15],
        tableOverflow: true,
        tableWidth: '100%',
        tableHeight: '100%',
        colWidths: w.jwidths || [],
        style: w.jstyle || {},
        mergeCells: w.jmerge || {},
        stripHTML: true,
        editable: !isReadOnly,
        contextMenu: isReadOnly ? false : undefined,
        onevent: function(eventName) {
          if (isReadOnly) {
            const attemptEvents = ['onbeforechange', 'onbeforeinsertrow', 'onbeforedeleterow', 'onbeforeinsertcolumn', 'onbeforedeletecolumn', 'oneditionstart', 'onchange'];
            if (attemptEvents.includes(eventName)) {
              // Read-only toast if necessary
            }
            const dataChangingEvents = ['onchange', 'oninsertrow', 'ondeleterow', 'oninsertcolumn', 'ondeletecolumn', 'onresizecolumn', 'onresizerow', 'onmoverow', 'onmovecolumn', 'onchangeheader', 'onstyle', 'onmerge'];
            if (dataChangingEvents.includes(eventName)) {
              setTimeout(() => { if (jinst) jinst.setData(w._baseJdata || w.jdata); }, 10);
            }
            return false;
          }

          if (w.locked) {
            const attemptEvents = ['onbeforechange', 'onbeforeinsertrow', 'onbeforedeleterow', 'onbeforeinsertcolumn', 'onbeforedeletecolumn', 'oneditionstart', 'onchange'];
            if (attemptEvents.includes(eventName)) {
              if (window._appModules?.showUndoToast) window._appModules.showUndoToast('잠긴 위젯입니다. (Ctrl+L로 해제)');
            }
            // If it's a data changing event while locked, aggressively revert and cancel
            const dataChangingEvents = ['onchange', 'oninsertrow', 'ondeleterow', 'oninsertcolumn', 'ondeletecolumn', 'onresizecolumn', 'onresizerow', 'onmoverow', 'onmovecolumn', 'onchangeheader', 'onstyle', 'onmerge'];
            if (dataChangingEvents.includes(eventName)) {
              setTimeout(() => { if (jinst) jinst.setData(w._baseJdata || w.jdata); }, 10);
            }
            return false;
          }

          const dataChangingEvents = [
            'onchange', 'oninsertrow', 'ondeleterow', 'oninsertcolumn', 'ondeletecolumn',
            'onresizecolumn', 'onresizerow', 'onmoverow', 'onmovecolumn', 'onchangeheader',
            'onstyle', 'onmerge'
          ];
          if (dataChangingEvents.includes(eventName)) {
            triggerSave();
          }

          // 2번 및 3번 이슈: 현재 활성 편집 상태 추적
          if (eventName === 'oneditionstart') {
            w._isEditing = true;
          } else if (eventName === 'oneditionend') {
            w._isEditing = false;
            // 편집이 완료되었고 대기 중인 리모트 업데이트가 예약되어 있다면 지연 실행
            if (w._applyPendingRemoteUpdate) {
              setTimeout(() => {
                if (w._applyPendingRemoteUpdate) {
                  w._applyPendingRemoteUpdate();
                  delete w._applyPendingRemoteUpdate;
                }
              }, 100);
            }
          }
        }
      });
      
      // 변경 감지 디바운싱 저장 함수
      function triggerSave() {
        if (w._jexcelSaveTimeout) clearTimeout(w._jexcelSaveTimeout);
        w._jexcelSaveTimeout = setTimeout(() => {
          if (!document.getElementById('w-' + w.id)) return;
          
          const localData = jinst.getData();
          w.jdata = localData;
          w.jwidths = jinst.getWidth();
          w.jstyle = jinst.getStyle();
          w.jmerge = jinst.getConfig().mergeCells || {};
          
          // 로컬 유저가 수정한 셀의 좌표와 값(Delta) 계산
          const baseData = w._baseJdata || [];
          const delta = {};
          const maxR = Math.max(localData.length, baseData.length);
          for (let r = 0; r < maxR; r++) {
            const lr = localData[r] || [];
            const br = baseData[r] || [];
            const maxC = Math.max(lr.length, br.length);
            for (let c = 0; c < maxC; c++) {
              const lv = lr[c] !== undefined ? lr[c] : '';
              const bv = br[c] !== undefined ? br[c] : '';
              if (lv !== bv) {
                delta[`${r},${c}`] = lv;
              }
            }
          }
          w._localDelta = delta;
          
          w.updatedAt = Date.now();
          events.emit('pending:add', w.id);
          events.emit('app:save');
        }, 500);
      }
    } catch(err) {
      console.error('Jspreadsheet create error:', err);
      if (containerEl) containerEl.innerHTML = `<div style="padding:20px;color:#ef4444;font-size:11px;">초기화 오류: ${err.message}</div>`;
    }
  }

  // 첫 실행 지연
  initialTimeout = setTimeout(initJexcel, 50);
  attachResizeHandle(el, w.id, 300, 200);
  return el;
}