// ══════════════════════════════════════════
// FEATURE GUIDE MODAL
// ══════════════════════════════════════════
let currentGuideSlide = 0;

export function openGuideModal() {
  currentGuideSlide = 0;
  initGuideDots();
  updateGuideUI();
  document.getElementById('guide-modal').style.display = 'flex';
}

export function closeGuideModal() {
  document.getElementById('guide-modal').style.display = 'none';
  localStorage.setItem('quillpen_onboarded', 'true');
}

export function moveGuide(dir) {
  const slides = document.querySelectorAll('.guide-slide');
  currentGuideSlide = Math.max(0, Math.min(slides.length - 1, currentGuideSlide + dir));
  updateGuideUI();
}

function initGuideDots() {
  const container = document.getElementById('guide-dots-container');
  if (!container) return;
  const count = document.querySelectorAll('.guide-slide').length;
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const dot = document.createElement('div');
    dot.className = 'guide-dot' + (i === 0 ? ' active' : '');
    container.appendChild(dot);
  }
}

function updateGuideUI() {
  const slides = document.querySelectorAll('.guide-slide');
  const dots = document.querySelectorAll('.guide-dot');
  slides.forEach((s, i) => s.classList.toggle('active', i === currentGuideSlide));
  dots.forEach((d, i) => d.classList.toggle('active', i === currentGuideSlide));
  document.getElementById('guide-prev').style.display = currentGuideSlide === 0 ? 'none' : 'block';
  const nextBtn = document.getElementById('guide-next');
  if (currentGuideSlide === slides.length - 1) {
    nextBtn.textContent = '시작하기';
    nextBtn.onclick = closeGuideModal;
  } else {
    nextBtn.textContent = '다음';
    nextBtn.onclick = () => moveGuide(1);
  }
}
