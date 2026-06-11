import '@sovereignfs/ui/tokens.css';
import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Sovereign',
  description: 'Your self-hosted workspace.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
