import type { Metadata } from "next";

import { getSidebarApps } from "../src/launcher";

import "./globals.css";

export const metadata: Metadata = {
  title: "Sovereign",
  description: "Personal platform runtime",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const sidebarApps = getSidebarApps();

  return (
    <html lang="en">
      <body>
        <aside>
          <strong>Sovereign</strong>

          <nav>
            {sidebarApps.map((app) => (
              <a key={app.id} href={app.launch.path}>
                {app.name}
              </a>
            ))}
          </nav>
        </aside>
        <main>{children}</main>
      </body>
    </html>
  );
}
