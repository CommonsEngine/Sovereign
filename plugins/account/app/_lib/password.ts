/** Minimum new-password length (SRS ACC-04). */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Client-side validation for a password change: enforce the minimum length and
 * the confirmation match. Returns an error message, or null when valid.
 * better-auth still verifies the *current* password server-side.
 */
export function validatePasswordChange(newPassword: string, confirm: string): string | null {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return `New password must be at least ${String(MIN_PASSWORD_LENGTH)} characters.`;
  }
  if (newPassword !== confirm) {
    return 'New password and confirmation do not match.';
  }
  return null;
}
