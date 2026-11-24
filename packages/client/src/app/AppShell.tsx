// The navigation shell around every owner and staff screen (KTD14, KTD20, U3 plan step 6). It finds
// out who is signed in, shows the sign-in screen when nobody is, and otherwise shows the header, the
// menu for that role, and the screen the address names.
import { GYM_NAME } from "@jeyos/shared";
import { useEffect, useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate } from "react-router";

import { api, setCsrfToken, setSignedOutHandler } from "../api.ts";
import { LoginPage } from "../auth/LoginPage.tsx";
import type { SignedIn } from "../auth/LoginPage.tsx";
import { GROUP_LABELS, SCREENS, screensFor } from "./screens.tsx";
import type { Screen, ScreenGroup } from "./screens.tsx";

// "loading" until GET /api/auth/session answers, so a signed-in person never sees the sign-in
// screen flash past on a reload
type Who = SignedIn | null | "loading";

/** screens is only passed by tests; the app uses SCREENS. */
export function AppShell({ screens = SCREENS }: { screens?: readonly Screen[] }) {
  const [who, setWho] = useState<Who>("loading");
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Any request that finds the session gone (idle timeout, account disabled) lands here (R52)
    setSignedOutHandler(() => {
      setCsrfToken(null);
      setWho(null);
    });
    // React runs effects twice in development to catch mistakes, so an answer that arrives after
    // this effect was cleaned up is ignored
    let ignore = false;
    // The page lost the CSRF token on reload, so it asks for it again along with who is signed in
    api<(SignedIn & { csrfToken: string }) | null>("/auth/session", { userStarted: true })
      .then((answer) => {
        if (!ignore) {
          setCsrfToken(answer?.csrfToken ?? null);
          setWho(answer && { displayName: answer.displayName, role: answer.role });
        }
      })
      // The sign-in screen then says what went wrong when the person tries to sign in
      .catch(() => {
        if (!ignore) {
          setWho(null);
        }
      });
    return () => {
      ignore = true;
    };
  }, []);

  async function signOut() {
    setSignOutError(null);
    try {
      await api("/auth/sign-out", { method: "POST", userStarted: true });
    } catch {
      // The session cookie is HttpOnly, so only the server can end it. Saying "signed out" here
      // when it isn't would leave the next person at the desk signed in as this one
      setSignOutError("Couldn't sign out. Check that the gym PC is on, then try again.");
      return;
    }
    setCsrfToken(null);
    setWho(null);
    // The next person starts from the start screen, not the last one used
    void navigate("/");
  }

  if (who === "loading") {
    return <p className="loading">Loading…</p>;
  }
  if (who === null) {
    return <LoginPage onSignedIn={setWho} />;
  }

  const visible = screensFor(who.role, screens);
  const groups = (Object.keys(GROUP_LABELS) as ScreenGroup[])
    .map((group) => ({ group, screens: visible.filter((screen) => screen.group === group) }))
    .filter(({ screens: inGroup }) => inGroup.length > 0);

  return (
    <div className="shell">
      <header className="shell-header">
        <Link to="/" className="shell-gym">
          {GYM_NAME}
        </Link>
        <span className="shell-who">{who.displayName}</span>
        <button
          type="button"
          onClick={() => {
            void signOut();
          }}
        >
          Sign out
        </button>
        {signOutError !== null && (
          <p role="alert" className="shell-error">
            {signOutError}
          </p>
        )}
      </header>
      {groups.length > 0 && (
        <nav className="shell-nav" aria-label="Screens">
          {groups.map(({ group, screens: inGroup }) => (
            <section key={group}>
              <h2>{GROUP_LABELS[group]}</h2>
              <ul>
                {inGroup.map((screen) => (
                  <li key={screen.path}>
                    {/* NavLink marks the open screen with aria-current="page" */}
                    <NavLink to={screen.path}>{screen.label}</NavLink>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
      )}
      <main className="shell-main">
        <Routes>
          <Route
            index
            element={
              <>
                <h1>Welcome, {who.displayName}</h1>
                <p>Pick a screen from the menu.</p>
              </>
            }
          />
          {visible.map((screen) => (
            <Route key={screen.path} path={screen.path} element={screen.element} />
          ))}
          {/* A mistyped address, or an owner screen opened by staff */}
          <Route
            path="*"
            element={
              <>
                <h1>No screen here</h1>
                <p>
                  <Link to="/">Go to the start screen</Link>
                </p>
              </>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
