'use client';

import { useActionState } from 'react';
import { changePasswordAction, type PasswordState } from '../actions';
import styles from '../account.module.css';

export function PasswordChangeForm() {
  const [state, formAction, pending] = useActionState<PasswordState, FormData>(
    changePasswordAction,
    null,
  );

  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="currentPassword">
          Current password
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className={styles.input}
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="newPassword">
          New password
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={styles.input}
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="confirmPassword">
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={styles.input}
        />
      </div>

      {state?.ok === false && <p className={styles.error}>{state.error}</p>}
      {state?.ok === true && <p className={styles.success}>Password changed.</p>}

      <button type="submit" className={styles.button} disabled={pending}>
        {pending ? 'Changing…' : 'Change password'}
      </button>
    </form>
  );
}
