import { createAuthClient } from 'better-auth/react';

// Same-origin: the client talks to this app's own /api/auth routes.
export const authClient = createAuthClient();
