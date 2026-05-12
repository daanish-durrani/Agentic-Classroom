import { SignIn } from '@clerk/nextjs';
import { notFound } from 'next/navigation';
import { isClerkEnabled } from '@/lib/server/auth-mode';

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
