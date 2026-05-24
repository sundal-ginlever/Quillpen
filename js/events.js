// ══════════════════════════════════════════
// EVENT BUS (PUB/SUB)
// ══════════════════════════════════════════
class EventBus {
  constructor() { this.listeners = {}; }
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }
  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }
  emit(event, data, data2) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(cb => {
      try { cb(data, data2); } catch (e) { console.error(`Event ${event} error:`, e); }
    });
  }
}
export const events = new EventBus();
