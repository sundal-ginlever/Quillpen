## Implementation Details

### 1. Auth Robustness Enhancement
- **File**: `js/auth.js`
- **Changes**:
    - Wrapped `sb.auth.getSession()` in a `try-catch` block.
    - Added logic to catch `error` from `getSession()`. If an error occurs, `sb.auth.signOut()` is executed to clear the invalid refresh token from the browser.
    - Updated `onAuthStateChange` to handle the `SIGNED_OUT` event by reloading the page (`location.reload()`), ensuring a clean state for the next login attempt.

### 2. Sync Resilience Optimization
- **File**: `js/sync.js`
- **Changes**:
    - In `loadFromCloud()`, added `events.emit('app:start')` to the `catch` block.
    - This ensures that even if cloud data loading fails (due to network or auth issues), the application UI will still unhide and initialize in local mode, preventing a perpetual loading screen.

### 3. Spreadsheet Widget Stability
- **File**: `js/widgets/spreadsheet.js`
- **Changes**:
    - Wrapped `luckysheet.resize()` in a `try-catch` block and added a DOM existence check (`document.getElementById`).
    - This prevents the `TypeError: Cannot read properties of null (reading 'style')` error when a widget is deleted or the canvas is moved.
    - Improved cleanup logic by clearing resize timers and Luckysheet containers more thoroughly.

### 4. Tab-Close / Unload Data Protection
- **File**: `js/sync.js`
- **Changes**:
    - Added `beforeunload` and `visibilitychange` event listeners.
    - **Logic**: Even if the user closes the tab before the 1.2s cloud sync completes, the app now forces a `saveLocal()` to LocalStorage.
    - **Safety Net**: Because Quillpen uses a "Local-First" strategy, any unsynced changes in LocalStorage are automatically merged and pushed to Supabase the next time the app is opened.

### 5. UI/UX Polishing
- **File**: `index.html`
- **Changes**:
    - Updated `<title>` to **Quillpen**.
    - Added an inline SVG favicon to resolve the `404 /favicon.ico` error.

### 6. Architectural Shift: Local-First + Manual Sync
- **Files**: `js/sync.js`, `js/app.js`, `index.html`, `css/main.css`
- **Changes**:
    - **Auto-Push Disabled**: Removed the automatic 1.2s cloud sync trigger to reduce network overhead and "orange dot" anxiety.
    - **Instant Local Save**: Maintained `saveLocal()` on every change. Data is now 100% safe in the browser's LocalStorage immediately.
    - **Manual Sync Button**: Added a **"☁ 저장" (Cloud Save)** button next to the sync indicator.
    - **Keyboard Shortcut**: Implemented **`Ctrl + S`** (or Cmd+S) to trigger manual synchronization to Supabase.
    - **Sync State UI**: 
        - 🟢 **서버와 일치**: Local and Cloud are in sync.
        - 🟡 **동기화 필요**: Local has newer changes not yet pushed to Cloud.
        - 🟠 **서버 저장 중...**: Sync in progress.
- **Reason**: To eliminate latency-related anxiety and give the user full control over when to commit their work to the cloud.

### 7. Responsive UI for Narrow Screens
- **Files**: `css/main.css`, `js/toolbar.js`
- **Changes**:
    - **Toolbar Wrapping**: Added media queries (`max-width: 768px`) to enforce `flex-wrap: wrap` and `max-width: 95vw` on the top toolbar so it doesn't overflow horizontally on mobile or split-screen browsers.
    - **Sync Indicator Repositioning**: Moved the `#sync-indicator` to the bottom-right on small screens to prevent it from overlapping with the expanded toolbar.
    - **Statusbar Optimization**: Added a `.hide-on-mobile` class to hide less important text in the bottom-left status bar to conserve screen real estate.
- **Reason**: To improve usability on mobile devices and narrow browser windows where the long toolbar was previously cut off.

## Status: DEPLOYED
All changes have been committed and pushed.
Next recommendation: Test the UI on a mobile device or by resizing the browser window to confirm layout stability.
