import { spawnSync } from 'child_process';

export type ClipboardCopyResult =
  | { ok: true; method: string }
  | { ok: false; error: string };

function tryCopyWith(cmd: string, args: string[], text: string): ClipboardCopyResult {
  const res = spawnSync(cmd, args, { encoding: 'utf8', input: text, timeout: 2000 });
  if (res.error) return { ok: false, error: res.error.message };
  if (typeof res.status === 'number' && res.status !== 0) {
    const stderr = res.stderr ? String(res.stderr) : '';
    return { ok: false, error: `${cmd} exited ${res.status}${stderr ? `: ${stderr}` : ''}` };
  }
  return { ok: true, method: cmd };
}

export function copyToClipboard(text: string): ClipboardCopyResult {
  // Allow tests/users to provide a deterministic clipboard tool.
  const override = process.env.WAIF_CLIPBOARD_CMD;
  if (override) {
    return tryCopyWith(override, [], text);
  }

  // macOS
  if (process.platform === 'darwin') {
    return tryCopyWith('pbcopy', [], text);
  }

  // Windows (best-effort; `clip` is a shell builtin in cmd.exe)
  if (process.platform === 'win32') {
    return tryCopyWith('cmd', ['/c', 'clip'], text);
  }

  // Linux/Wayland/X11
  const wayland = process.env.WAYLAND_DISPLAY;
  if (wayland) {
    const res = tryCopyWith('wl-copy', [], text);
    if (res.ok) return res;
  }

  // X11 fallback
  const xclip = tryCopyWith('xclip', ['-selection', 'clipboard'], text);
  if (xclip.ok) return xclip;

  const xsel = tryCopyWith('xsel', ['--clipboard', '--input'], text);
  if (xsel.ok) return xsel;

  return { ok: false, error: 'No clipboard tool found (tried wl-copy, xclip, xsel)' };
}
