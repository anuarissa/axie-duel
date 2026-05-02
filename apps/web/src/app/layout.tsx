import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Axie Duel',
  description: 'TCG Web3 estilo Yu-Gi-Oh! ambientado en Axie Infinity, sobre Ronin.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
          background: 'radial-gradient(circle at 30% 20%, #1a0d2e 0%, #0a0518 70%, #000 100%)',
          color: '#e8e3f3',
          minHeight: '100vh',
        }}
      >
        {children}
      </body>
    </html>
  );
}
