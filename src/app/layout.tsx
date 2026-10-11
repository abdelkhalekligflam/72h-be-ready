import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: '72H Be Ready — Prepare with confidence', description: 'Focused digital study guides designed to help you prepare efficiently.' };
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>}
