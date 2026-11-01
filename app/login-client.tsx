"use client";

// Login screen (spec 004 US1): hosts the Google Identity Services button.
// The client receives only the public GOOGLE_CLIENT_ID as a prop — the
// approved addresses and the session secret never reach the browser.
// On a successful signIn the server sets the session cookie and the router
// refresh swaps in the vote screen. Failures show a short honest hint
// (FR-010); a non-approved account gets the friendly denial (US3).
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, type SignInResult } from "@/app/actions";
import styles from "./page.module.css";

interface GoogleCredentialResponse {
  credential?: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: Record<string, unknown>
          ) => void;
        };
      };
    };
  }
}

export default function LoginClient({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);
  // Guards against double renderButton calls in React 19 StrictMode.
  const renderedRef = useRef(false);

  const handleCredential = useCallback(
    (response: GoogleCredentialResponse) => {
      const idToken = response.credential;
      if (!idToken) {
        // Popup closed / consent cancelled: stay on login, no partial state.
        setError("Anmeldung abgebrochen — bitte erneut versuchen.");
        return;
      }
      setPending(true);
      setError(null);
      signIn(idToken)
        .then((result: SignInResult) => {
          if (result.ok) {
            router.refresh();
          } else if (result.reason === "not-approved") {
            setError("Diese Adresse ist nicht freigeschaltet.");
          } else if (result.reason === "server-config" && result.detail) {
            // Operator diagnostic (never secret values — see app/actions.ts).
            setError(`Konfigurationsproblem: ${result.detail}`);
          } else {
            setError("Anmeldung fehlgeschlagen — bitte erneut versuchen.");
          }
        })
        .catch(() => {
          setError("Anmeldung fehlgeschlagen — bitte erneut versuchen.");
        })
        .finally(() => setPending(false));
    },
    [router]
  );

  useEffect(() => {
    if (renderedRef.current) return;
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      if (!window.google || renderedRef.current || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredential,
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        text: "signin_with",
        locale: "de",
      });
      renderedRef.current = true;
    };
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, [clientId, handleCredential]);

  return (
    <div className={styles.pickUser}>
      <h1>Anmelden</h1>
      <p className={styles.hint}>
        Melde dich mit deinem Google-Konto an, um abzustimmen.
      </p>
      <div className={styles.userButtons}>
        <div ref={buttonRef} aria-busy={pending} />
      </div>
      {error !== null && (
        <p role="alert" className={styles.loginError}>
          {error}
        </p>
      )}
    </div>
  );
}
