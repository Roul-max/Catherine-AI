import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Catherine AI',
  description: 'Catherine AI System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="antialiased min-h-screen selection:bg-[var(--accent-30)] font-sans transition-colors duration-300" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
