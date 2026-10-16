import type { Metadata, Viewport } from 'next';
import { Inter, Noto_Sans_Devanagari } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const devanagari = Noto_Sans_Devanagari({ subsets: ['devanagari'], variable: '--font-devanagari', weight: ['400', '500', '600', '700'] });

export const metadata: Metadata = {
  title: 'DiNaDeNa · Chowk to Home',
  description: 'Hire verified daily wage workers in minutes, with OTP attendance and UPI payment.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f45b14',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${devanagari.variable}`}>
      {/* Browser extensions (e.g. Grammarly) add attributes to <body> before React hydrates. */}
      <body className="antialiased" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
