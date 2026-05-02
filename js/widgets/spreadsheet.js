// ══════════════════════════════════════════
// SPREADSHEET WIDGET (Luckysheet Engine)
// ══════════════════════════════════════════
import { state } from '../state.js';
import { resizeHandleHTML, attachResizeHandle } from '../utils.js';
import { events } from '../events.js';
import { deleteWidget } from './core.js';

/**
 * Luckysheet을 위젯 내부에 렌더링하고 동기화 로직을 연결합니다.
 */
export function renderSpreadsheet(w) {
  // DB에서 w, h 값이 누락(0 또는 undefined)되었을 경우 기본값 보장
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
    <div id="lucky-${w.id}" style="margin:0;padding:0;position:absolute;width:100%;height:calc(100% - 32px);left:0;top:32px;background:#fff;">
      <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:12px;">준비 중...</div>
    </div>
    ${resizeHandleHTML()}
  `;

  const luckyContainerId = `lucky-${w.id}`;
  const delBtn = el.querySelector('.del-btn');
  delBtn.addEventListener('pointerdown', e => { e.stopPropagation(); deleteWidget(w.id); });

  // 2. Luckysheet 초기화 (재시도 로직 포함)
  let retryCount = 0;
  function initLucky() {
    const containerEl = document.getElementById(luckyContainerId);
    
    // 1) 위젯이 화면에 붙지 않은 상태면 대기 (무한 멈춤 방지를 위해 else 블록 추가)
    if (!containerEl || containerEl.offsetWidth === 0) {
      if (retryCount < 50) {
        retryCount++;
        setTimeout(initLucky, 200);
      } else {
        if (containerEl) containerEl.innerHTML = '<div style="padding:20px;color:#ef4444;font-size:12px;">위젯 로드 실패 (크기 계산 오류)</div>';
      }
      return;
    }

    // 2) Luckysheet 라이브러리(CDN)가 아직 로드되지 않았으면 대기
    if (typeof luckysheet === 'undefined') {
      if (retryCount < 50) { // 최대 10초 대기 (50 * 200ms)
        retryCount++;
        setTimeout(initLucky, 200);
      } else {
        containerEl.innerHTML = '<div style="padding:20px;color:#ef4444;font-size:12px;">라이브러리 로드 지연 (인터넷 환경을 확인해주세요)</div>';
      }
      return;
    }

    // 이전 버전의 잘못된 데이터(`data: []` 등)가 저장되어 있을 경우 
    // Luckysheet 내부에서 functionlist 참조 오류가 발생하므로 이를 검증 및 복구합니다.
    let initialData = w.luckyData;
    if (initialData && Array.isArray(initialData) && initialData.length > 0) {
      const firstSheet = initialData[0];
      // 유효하지 않은 포맷(celldata가 없거나 data가 빈 배열인 경우)이면 초기화
      if (!firstSheet.celldata && (!firstSheet.data || firstSheet.data.length === 0)) {
        initialData = null; 
      } else {
        // 필수 프로퍼티 보강
        if (firstSheet.index === undefined) firstSheet.index = 0;
        if (typeof firstSheet.status === 'string') firstSheet.status = 1;
      }
    }

    if (!initialData) {
      initialData = [
        { 
          "name": "Sheet1", 
          "status": 1, 
          "order": 0, 
          "index": 0,
          "row": 30, 
          "column": 15, 
          "celldata": [],
          "config": {}
        }
      ];
    }
    
    try {
      luckysheet.create({
        container: luckyContainerId,
        lang: 'en', // Luckysheet는 기본적으로 한국어('ko')를 지원하지 않아 크래시(functionlist 에러)가 발생합니다.
        data: initialData,
        showtoolbar: false,
        showinfobar: false,
        showsheetbar: false,
        showstatisticBar: false,
        sheetFormulaBar: true,
        enableAddRow: true,
        allowUpdate: false, // true로 설정하면 자체 웹소켓 연동을 시도하여 무한 Loading 현상이 발생합니다.
        gridKey: w.id,
        hook: {
          updated: function() {
            if (w._luckyUpdateTimeout) clearTimeout(w._luckyUpdateTimeout);
            w._luckyUpdateTimeout = setTimeout(() => {
              w.luckyData = luckysheet.getAllSheets();
              w.updatedAt = Date.now();
              events.emit('pending:add', w.id);
              events.emit('app:save');
            }, 500); // 500ms 디바운스로 성능 향상
          }
        }
      });
      
      // 생성 직후 리사이즈 강제 실행 (백지 현상 방지)
      setTimeout(() => { if (typeof luckysheet !== 'undefined') luckysheet.resize(); }, 100);

      const ro = new ResizeObserver(() => { if (typeof luckysheet !== 'undefined') luckysheet.resize(); });
      ro.observe(el);
      el._cleanupFn = () => {
        ro.disconnect();
        if (w._luckyUpdateTimeout) clearTimeout(w._luckyUpdateTimeout);
        // Luckysheet는 싱글톤 성격이 강해 삭제 시 컨테이너를 비워주지 않으면 
        // 다음 위젯 생성 시 내부 요소 참조 오류(style of null)가 발생합니다.
        const luckyDiv = document.getElementById(luckyContainerId);
        if (luckyDiv) luckyDiv.innerHTML = ''; 
      };
    } catch(err) {
      console.error('Luckysheet create error:', err);
      if (containerEl) containerEl.innerHTML = `<div style="padding:20px;color:#ef4444;font-size:11px;">초기화 오류: ${err.message}</div>`;
    }
  }

  // 첫 실행 지연
  setTimeout(initLucky, 50);
  attachResizeHandle(el, w.id, 300, 200);
  return el;
}