// useSearchParams() needs a Suspense boundary or Next refuses to build the
// page, so the interactive part lives in its own client component.
import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in · FAIR Risk Radar" };

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <LoginForm />
    </Suspense>
  );
}
