import { SignUp } from '@clerk/nextjs';
import { notFound } from 'next/navigation';
import { isClerkEnabled } from '@/lib/server/auth-mode';

/**
 * Render the sign-up page that centers Clerk's sign-up form.
 *
 * If Clerk is not enabled in the current environment, this component triggers Next.js's `notFound()` to produce a 404 response instead of rendering the Clerk UI.
 *
 * @returns The JSX element for the sign-up page containing the Clerk `SignUp` component.
 */
export default function SignUpPage() {
  // Don't render Clerk components on admin instances without Clerk
  if (!isClerkEnabled) {
    notFound();
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background">
      <SignUp />
    </div>
  );
}
