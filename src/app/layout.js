import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const sans = Geist({ subsets: ['latin'], variable: '--sans' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--mono' });

export const metadata = {
  title: 'Ikigai Finance Community',
  description: 'Open-source, review-first financial evidence inbox for Telegram receipts and claims.',
};

export default function RootLayout({ children }) {
  return <html lang="en" className={`${sans.variable} ${mono.variable}`}><body>{children}</body></html>;
}
