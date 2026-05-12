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
 * Conditionally wraps the provided children with ClerkProvider when Clerk is enabled.
 *
 * If Clerk is not configured, returns the children unchanged. ClerkProvider is intended
 * for use in Next.js Server Components.
 *
 * @param children - The React nodes to render inside the optional auth wrapper
 * @returns The rendered children, wrapped with `ClerkProvider` when Clerk is enabled
 */
function AuthWrapper({ children }: { children: React.ReactNode }) {
  if (isClerkEnabled) {
    return <ClerkProvider>{children}</ClerkProvider>;
  }

  // Clerk not configured — render without auth wrapper
  return <>{children}</>;
}

/**
 * Renders the application's top-level HTML and body structure, including global providers and UI helpers.
 *
 * @param children - The application content to render inside the layout
 * @returns The root HTML element for the Next.js app containing theme, i18n, server providers, optional auth wrapper, and a toaster
 */
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
