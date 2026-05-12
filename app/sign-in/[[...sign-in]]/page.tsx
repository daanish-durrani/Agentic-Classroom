import { SignIn } from '@clerk/nextjs';
import { notFound } from 'next/navigation';
import { isClerkEnabled } from '@/lib/server/auth-mode';

/**
 * Render the sign-in page showing Clerk's SignIn UI when Clerk is enabled.
 *
 * If Clerk is not enabled, this page triggers Next.js's 404 behavior.
 *
 * @returns A React element that centers and displays the Clerk `<SignIn />` component; when Clerk is disabled, the route results in a 404 page.
 */
export default function SignInPage() {
  // Don't render Clerk components on admin instances without Clerk
  if (!isClerkEnabled) {
    notFound();
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background">
      <SignIn />
    </div>
  );
}
