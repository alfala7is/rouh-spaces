'use client';

import { useEffect } from 'react';

export function ErrorBoundaryProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Suppress MetaMask and other browser extension errors
    const handleError = (event: ErrorEvent) => {
      const message = event.message?.toLowerCase() || '';
      const source = event.filename?.toLowerCase() || '';

      // Check if error is from MetaMask or other extensions
      if (
        message.includes('metamask') ||
        source.includes('chrome-extension://') ||
        source.includes('moz-extension://') ||
        message.includes('failed to connect to metamask')
      ) {
        event.preventDefault();
        event.stopPropagation();
        return true;
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason?.message?.toLowerCase() || String(event.reason).toLowerCase();

      if (
        reason.includes('metamask') ||
        reason.includes('failed to connect to metamask')
      ) {
        event.preventDefault();
        return true;
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return <>{children}</>;
}