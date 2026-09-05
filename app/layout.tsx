import type { Metadata } from 'next'
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import NavBar from "@/app/components/util/NavBar"
import Plus1Layer from "@/app/components/util/Plus1Layer"
import UserProvider from "@/app/components/user/UserContext"

const fraunces = Fraunces({
    subsets: ['latin'],
    variable: '--font-display',
    weight: 'variable',
    style: ['normal', 'italic'],
})

const plexSans = IBM_Plex_Sans({
    subsets: ['latin'],
    variable: '--font-body',
    weight: ['400', '500', '600'],
    style: ['normal', 'italic'],
})

const plexMono = IBM_Plex_Mono({
    subsets: ['latin'],
    variable: '--font-mono',
    weight: ['400', '500', '600'],
})

export const metadata: Metadata = {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
    title: { default: 'NG+ | Your Gaming Identity', template: '%s | NG+' },
    description: 'Track, rate, and share the games that define you.',
    openGraph: { siteName: 'NG+', type: 'website' },
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en" className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable}`}>
            <body>
                <UserProvider>
                    <Plus1Layer />
                    <header className="w-full">
                        <NavBar />
                    </header>
                    <div className="min-h-screen bg-(--color-bg) text-(--color-text)">
                        {children}
                    </div>
                </UserProvider>
            </body>
        </html>
    )
}
