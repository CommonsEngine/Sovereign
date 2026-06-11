import '@sovereignfs/ui/tokens.css';
import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Sovereign',
  description: 'Sign in to your Sovereign workspace.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
