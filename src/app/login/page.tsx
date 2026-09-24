// useSearchParams() needs a Suspense boundary or Next refuses to build the
// page, so the interactive part lives in its own client component.
import { Suspense } from "react";
import { LoginForm } from "./LoginForm";
import { Splash } from "./Splash";

export const metadata = { title: "Sign in · FAIR Risk Radar" };

export default function LoginPage() {
  return (
    <>
      {/* Overlays the form rather than gating it: the page is already rendered
          and usable underneath, so nothing is waiting on the animation. */}
      <Splash />
      <Suspense fallback={<main className="min-h-screen" />}>
        <LoginForm />
      </Suspense>
    </>
  );
}
