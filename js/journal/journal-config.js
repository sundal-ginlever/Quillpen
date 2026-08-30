// ══════════════════════════════════════════
// JOURNAL CONFIG — namespaced local keys, constants
// (does not overlap with existing qp_local_* / quillpen_* canvas keys)
// ══════════════════════════════════════════
export const JOURNAL_LOCAL_PREFIX = 'qp_journal_v1_';
export const JOURNAL_BUCKET = 'quillpen-images';

export function journalLocalKey(userId) {
  return JOURNAL_LOCAL_PREFIX + (userId || 'local');
}

// How long a deleted block's "되돌리기" toast stays actionable.
export const DELETE_UNDO_MS = 5000;

export const BLOCK_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  // Reserved for future implementation — no UI is exposed for these yet.
  AUDIO: 'audio',
  HANDWRITING: 'handwriting',
};
