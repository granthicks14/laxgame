import { h, clear } from './dom';
import type { App } from './App';
import {
  ACTIONS, DEFAULT_KEYBINDS, UNBINDABLE, bindingText, clearBinding, keyLabel, ownerOf, rebind,
  type ActionId,
} from '../state/keybinds';

/**
 * Rebinding UI shared by Settings and the in-game pause menu, so the two can
 * never drift apart. Click a key, press a new one. Taking a key that another
 * action owns moves it, and the loser falls back to its default rather than
 * ending up with nothing — there is no way to leave a control unbound.
 */
export function keybindEditor(app: App, onChange?: () => void): HTMLElement {
  const root = h('div', { class: 'stack', style: 'gap:4px' });
  let listening: { action: ActionId; slot: number } | null = null;

  const stop = () => {
    listening = null;
    window.removeEventListener('keydown', onKey, true);
    render();
  };

  const onKey = (e: KeyboardEvent) => {
    if (!listening) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Escape') { stop(); return; }
    if (UNBINDABLE.has(e.code)) {
      note.textContent = `${keyLabel(e.code)} is reserved by the browser.`;
      return;
    }
    const { action, slot } = listening;
    const res = rebind(app.keybinds, action, slot, e.code);
    app.setKeybinds(res.binds);
    note.textContent = res.stolenFrom
      ? `${keyLabel(e.code)} moved from ${labelOf(res.stolenFrom)}.`
      : `${labelOf(action)} is now ${keyLabel(e.code)}.`;
    onChange?.();
    stop();
  };

  const note = h('div', { class: 'tiny', text: 'Click a key to change it.' });

  function labelOf(id: ActionId): string {
    return ACTIONS.find((a) => a.id === id)?.label ?? id;
  }

  function render(): void {
    clear(root);
    for (const action of ACTIONS) {
      const keys = app.keybinds[action.id];
      const listeningHere = listening && listening.action === action.id;
      // Listening for an extra key renders a placeholder slot, so the row shows
      // what it is waiting for instead of looking like nothing happened.
      const addingNew = !!listeningHere && listening!.slot >= keys.length;
      const slots: (string | null)[] = addingNew ? [...keys, null] : [...keys];

      const row = h('div', { class: `kb-row${listeningHere ? ' is-active' : ''}` },
        h('div', { class: 'kb-row__label' },
          h('div', { text: action.label }),
          h('div', { class: 'tiny', text: action.hint })),
        h('div', { class: 'kb-row__keys' },
          ...slots.map((code, i) => {
            const isListening = !!listeningHere && listening!.slot === i;
            return h('button', {
              class: `kb-key${isListening ? ' is-listening' : ''}`,
              text: isListening ? 'Press a key' : keyLabel(code ?? ''),
              on: {
                click: () => {
                  if (isListening) { stop(); return; }
                  startListening(action.id, i, `Press a key for ${action.label}, or Esc to cancel.`);
                },
              },
            });
          }),
          !addingNew && keys.length > 1
            ? h('button', {
              class: 'kb-key kb-key--drop', text: '\u2212', ariaLabel: `Remove a key from ${action.label}`,
              on: {
                click: () => {
                  app.setKeybinds(clearBinding(app.keybinds, action.id, keys.length - 1));
                  note.textContent = `${action.label} is now ${bindingText(app.keybinds, action.id)}.`;
                  onChange?.();
                  render();
                },
              },
            })
            : null,
          !addingNew && keys.length < 3
            ? h('button', {
              class: 'kb-key kb-key--add', text: '+', ariaLabel: `Add another key for ${action.label}`,
              on: {
                click: () => startListening(action.id, keys.length, `Press a key to add to ${action.label}, or Esc to cancel.`),
              },
            })
            : null,
        ),
      );
      root.appendChild(row);
    }
    root.appendChild(note);
    root.appendChild(h('button', {
      class: 'btn btn--block',
      text: 'Reset to defaults',
      on: {
        click: () => {
          app.setKeybinds({ ...DEFAULT_KEYBINDS });
          note.textContent = 'Back to the default layout.';
          onChange?.();
          render();
        },
      },
    }));
    // Surface any accidental duplicate so a conflict is never silent.
    const clash = findClash(app);
    if (clash) root.appendChild(h('div', { class: 'tiny bad', text: clash }));
  }

  function startListening(action: ActionId, slot: number, message: string): void {
    if (listening) {
      window.removeEventListener('keydown', onKey, true);
      listening = null;
    }
    listening = { action, slot };
    note.textContent = message;
    window.addEventListener('keydown', onKey, true);
    render();
  }

  render();
  return root;
}

function findClash(app: App): string | null {
  for (const a of ACTIONS) {
    for (const code of app.keybinds[a.id]) {
      const other = ownerOf(app.keybinds, code, a.id);
      if (other) return `${keyLabel(code)} is bound to both ${a.label} and ${ACTIONS.find((x) => x.id === other)?.label}.`;
    }
  }
  return null;
}
