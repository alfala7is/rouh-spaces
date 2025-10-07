import './globals.css';
import React from 'react';
import { ErrorBoundaryProvider } from './error-boundary';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-50 text-zinc-900">
        <ErrorBoundaryProvider>{children}</ErrorBoundaryProvider>
      </body>
    </html>
  );
}

