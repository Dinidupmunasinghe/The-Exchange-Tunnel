export function PrivacyPolicy() {
  return (
    <div className="h-screen overflow-y-auto bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-4 py-10 md:px-6">
        <h1 className="text-3xl font-bold">Exchange Tunnel Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: April 14, 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-6 text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground">1. What we collect</h2>
            <p>
              We collect account and platform data required to run Exchange Tunnel, including your name, email,
              SoundCloud user identifier, selected automation account (the SoundCloud profile used for actions),
              campaign and task activity, credits, and related timestamps.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">2. SoundCloud and OAuth data</h2>
            <p>
              Sign-in uses SoundCloud OAuth 2.1 with PKCE: your browser generates a one-time secret (code verifier)
              that is not stored on our servers until you complete login. We exchange the authorization code for an
              access token on the backend using your app&apos;s client secret. Tokens are used only to authenticate you,
              list your tracks where the product needs them, and perform the engagements you explicitly start (for
              example likes, comments, or reposts on SoundCloud URLs you interact with in the app). We do not sell this
              data and we request only what is needed for those features.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">3. How we use your data</h2>
            <p>
              Data is used to authenticate users, run campaigns, track credits, prevent abuse, support operations, and
              comply with legal obligations. SoundCloud access tokens and acting-account tokens are stored in encrypted
              form on the backend.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">4. Data retention</h2>
            <p>
              We retain data while your account is active or as needed for fraud prevention, security, tax/accounting,
              and legal compliance. You may request deletion as described below.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">5. Sharing</h2>
            <p>
              We do not sell personal data. Data may be shared with service providers strictly for hosting, database,
              and security operations under confidentiality obligations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">6. Security</h2>
            <p>
              We use reasonable technical and organizational safeguards to protect data. No method of storage or
              transmission is guaranteed to be 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">7. Your rights</h2>
            <p>
              You may request access, correction, or deletion of your data. For deletion requests, see our{" "}
              <a className="text-primary underline underline-offset-2" href="/data-deletion">
                Data Deletion Instructions
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">8. Contact</h2>
            <p>
              For privacy questions, contact:{" "}
              <a className="text-primary underline underline-offset-2" href="mailto:loomfoxdesignstudio@gmail.com">
                loomfoxdesignstudio@gmail.com
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
