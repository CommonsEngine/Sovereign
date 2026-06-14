import '@sovereignfs/ui/tokens.css';
import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Sovereign',
  description: 'Your self-hosted workspace.',
  // Installable PWA (SRS §3.11, PLT-09). The web manifest + icons live in
  // public/; the service worker is generated there at build by next-pwa.
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'Sovereign', statusBarStyle: 'default' },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#09090b',
};

// Resolve the theme before first paint to avoid a flash (ACC-08). Reads the
// `sv-theme` cookie written by the Account plugin; `light`/`dark` are applied
// directly, `system` (or unset) follows the OS via prefers-color-scheme. Runs
// synchronously as the first body child, before the rest of the tree paints.
const themeScript = `(function(){try{
var m=document.cookie.match(/(?:^|; )sv-theme=([^;]+)/);
var t=m?decodeURIComponent(m[1]):'system';
var dark=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.dataset.theme=dark?'dark':'light';
}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The theme script sets data-theme on <html> before hydration, so the
    // attribute intentionally differs from the server markup —
    // suppressHydrationWarning scopes React's mismatch check off this element
    // (the standard theming pattern; suppression does not extend to children).
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
