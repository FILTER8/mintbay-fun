import type { Metadata } from 'next';
import { Geist_Mono } from 'next/font/google';
import { Providers } from '@/components/providers';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import './globals.css';

const mono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

const description =
  'Where Art meets Chain. Create, remix, collect and launch fully on-chain pixel NFT collections with AI agents.';

export const metadata: Metadata = {
  metadataBase: new URL('https://mintbay.fun'),
  title: {
    default: 'Mintbay.fun — Create. Mint. Remix.',
    template: '%s | Mintbay.fun',
  },
  description,
  icons: {
    icon: '/icon.png',
    apple: '/apple-icon.png',
  },
  openGraph: {
    title: 'Mintbay.fun — Where Art meets Chain',
    description,
    url: 'https://mintbay.fun',
    siteName: 'Mintbay.fun',
    type: 'website',
    images: [
      {
        url: '/opengraph-image.png',
        width: 1200,
        height: 630,
        alt: 'Mintbay.fun — Where Art meets Chain',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mintbay.fun — Where Art meets Chain',
    description,
    images: ['/twitter-image.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={mono.variable}>
      <body>
        <Providers>
          <Header />
          <main>{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
