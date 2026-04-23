import type { ReactNode } from 'react';
import { Header } from './Header';

export function AppShell({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="min-h-screen flex flex-col bg-bg text-fg font-sans">
      <a className="skip-to-content" href="#main">
        Skip to content
      </a>
      <Header />
      <main id="main" className="flex-1 w-full">
        {children}
      </main>
    </div>
  );
}
