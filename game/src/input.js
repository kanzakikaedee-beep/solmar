// Keyboard and mouse input: one polled state the gameplay reads each frame.
// Tracks held keys, pressed-this-frame edges, and the mouse position in
// canvas pixels plus the world point under the cursor.

import { KEYS } from './config.js';

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false, worldX: 0, worldY: 0 };
  let anyKey = false;

  function codeToAction(code) {
    for (const [action, codes] of Object.entries(KEYS)) {
      if (codes.includes(code)) return action;
    }
    return null;
  }

  function onKeyDown(event) {
    // Any key counts as "a key was pressed" (menus advance on any key,
    // including Enter, which has no gameplay action).
    anyKey = true;
    const action = codeToAction(event.code);
    if (action) {
      if (!held.has(action)) pressed.add(action);
      held.add(action);
      if (action === 'handbrake' || action === 'pause') event.preventDefault();
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    const action = codeToAction(event.code);
    if (action) held.delete(action);
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (event.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (event.clientY - rect.top) * (canvas.height / rect.height);
  }

  function onMouseDown(event) {
    if (event.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
      anyKey = true;
    }
  }

  function onMouseUp(event) {
    if (event.button === 0) mouse.down = false;
  }

  function onBlur() {
    held.clear();
    mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    mouse,
    isHeld(action) {
      return held.has(action);
    },
    // True only on the frame the key went down.
    wasPressed(action) {
      return pressed.has(action);
    },
    // True if any key or click happened since the last check (menu advance).
    consumeAnyKey() {
      const v = anyKey;
      anyKey = false;
      return v;
    },
    // Call at the end of each frame: edges live for exactly one frame.
    endFrame() {
      pressed.clear();
      mouse.clicked = false;
    },
    // Axis in [-1, 1] from the movement keys.
    moveAxis() {
      let x = 0;
      let y = 0;
      if (held.has('left')) x -= 1;
      if (held.has('right')) x += 1;
      if (held.has('up')) y -= 1;
      if (held.has('down')) y += 1;
      return { x, y };
    },
  };
}
