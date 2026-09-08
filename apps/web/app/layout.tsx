import './globals.css';

export const metadata = { title: 'ORYN — Intelligent Customer Operations', description: 'AI-powered customer operations platform' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="id"><body>{children}</body></html>;
}
