import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';
import 'animate.css';
import 'katex/dist/katex.min.css';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { I18nProvider } from '@/lib/hooks/use-i18n';
import { Toaster } from '@/components/ui/sonner';
import { ServerProvidersInit } from '@/components/server-providers-init';
import { AccessCodeGuard } from '@/components/access-code-guard';
import { isClerkEnabled } from '@/lib/server/auth-mode';

const inter = localFont({
  src: '../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  variable: '--font-sans',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'OpenMAIC',
  description:
    'University LMS — AI-powered interactive classrooms with multi-agent learning experiences.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'OpenMAIC',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0a0a0a',
};

/**
 * Wrap children in ClerkProvider only when Clerk is fully configured.
 *
 * Note: ClerkProvider from @clerk/nextjs is designed for use in Server
 * Components (RSC). It is NOT a client component that needs 'use client'.
 * See: https://clerk.com/docs/references/nextjs/clerk-provider
 */
function AuthWrapper({ children }: { children: React.ReactNode }) {
  if (isClerkEnabled) {
    return <ClerkProvider>{children}</ClerkProvider>;
  }

  // Fallback: legacy access-code guard for admin instances
  return <AccessCodeGuard>{children}</AccessCodeGuard>;
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider>
          <I18nProvider>
            <ServerProvidersInit />
            <AuthWrapper>{children}</AuthWrapper>
            <Toaster position="top-center" />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
