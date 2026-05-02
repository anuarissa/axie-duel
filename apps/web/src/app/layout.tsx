import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Axie Duel',
  description: 'TCG Web3 estilo Yu-Gi-Oh! ambientado en Axie Infinity, sobre Ronin.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
