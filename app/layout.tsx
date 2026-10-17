import type { Metadata } from 'next';
import { Geist_Mono } from 'next/font/google';
import { Providers } from '@/components/providers';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import './globals.css';
const mono=Geist_Mono({subsets:['latin'],variable:'--font-geist-mono',display:'swap'});
export const metadata: Metadata={title:{default:'Mintbay.fun — Create. Mint. Remix.',template:'%s | Mintbay.fun'},description:'A playground for fully on-chain generative art. Make something. Put it on-chain. Remix everything.',openGraph:{title:'MINTBAY.FUN',description:'Create. Mint. Remix. Repeat.',type:'website'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" className={mono.variable}><body><Providers><Header/><main>{children}</main><Footer/></Providers></body></html>}
