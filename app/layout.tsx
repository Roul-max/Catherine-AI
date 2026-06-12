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
    <html lang="en" suppressHydrationWarning>
      <body className="bg-[#030303] text-[#e5e5e5] antialiased min-h-screen selection:bg-cyan-500/30 font-sans" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
