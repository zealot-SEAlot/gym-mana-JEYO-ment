import { GYM_NAME } from "@jeyos/shared";
import { useState } from "react";

import { LoginPage } from "./auth/LoginPage.tsx";
import type { SignedIn } from "./auth/LoginPage.tsx";

// Placeholder until the shell step (U3d): shows the sign-in screen, then who signed in. A reload
// forgets the sign-in here; the shell will ask GET /api/auth/session instead.
export function App() {
  const [signedIn, setSignedIn] = useState<SignedIn | null>(null);
  if (signedIn === null) {
    return <LoginPage onSignedIn={setSignedIn} />;
  }
  return (
    <main>
      <h1>{GYM_NAME}</h1>
      <p>
        Signed in as {signedIn.displayName} ({signedIn.role}).
      </p>
    </main>
  );
}
