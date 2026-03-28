import type { Metadata } from 'next';
import './globals.css';
import ScreenProtection from '@/components/ScreenProtection';
import Navbar from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'VelvetRoom — Adult Live Call Platform',
  description: 'Connect with performers via live video, audio, and chat.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-dark-900">
        <ScreenProtection />
        <Navbar />
        {children}
      </body>
    </html>
  );
}
