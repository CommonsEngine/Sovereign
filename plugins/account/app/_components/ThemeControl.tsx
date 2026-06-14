'use client';

import { useState, useTransition } from 'react';
import { updateThemeAction } from '../actions';
import styles from '../account.module.css';

const OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

/** Resolve a theme choice to the concrete attribute, following the OS for `system`. */
function resolve(theme: string): 'light' | 'dark' {
  if (theme === 'dark') return 'dark';
  if (theme === 'light') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Segmented control for appearance (ACC-08) — applies instantly, then persists. */
export function ThemeControl({ value }: { value: string }) {
  const [theme, setTheme] = useState(value);
  const [, startTransition] = useTransition();

  function choose(next: string): void {
    setTheme(next);
    // Apply before the round-trip so the change is instant (no flash).
    document.documentElement.dataset.theme = resolve(next);
    startTransition(() => {
      void updateThemeAction(next);
    });
  }

  return (
    <div className={styles.segmented} role="group" aria-label="Appearance">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={opt.value === theme ? styles.segmentActive : styles.segment}
          aria-pressed={opt.value === theme}
          onClick={() => {
            choose(opt.value);
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
