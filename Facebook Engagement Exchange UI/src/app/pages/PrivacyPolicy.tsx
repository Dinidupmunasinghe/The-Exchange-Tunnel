export function PrivacyPolicy() {
  return (
    <div className="h-screen overflow-y-auto bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-4 py-10 md:px-6">
        <h1 className="text-3xl font-bold">Exchange Tunnel Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: April 19, 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-6 text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground">1. What we collect</h2>
            <p>
              We collect account and platform data required to run Exchange Tunnel, including your name, email (or a
              provider-generated address when the provider does not return email), Telegram user id, connected channel
              identifiers, campaign and task activity, credits, and related timestamps.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">2. Telegram</h2>
            <p>
              Sign-in can use the official Telegram Login widget. The platform receives your public Telegram id and
              display fields needed to run the app. A server-configured bot token is used to verify the login payload and
              to call Telegram&apos;s API (e.g. to check channel membership for tasks). We do not sell this data; we use
              it to operate the features you request.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">3. How we use your data</h2>
            <p>
              Data is used to authenticate users, run campaigns, track credits, prevent abuse, and comply with legal
              obligations. Secrets are not stored in the browser; server-side storage follows least-privilege and
              encryption for sensitive fields.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">4. Data retention</h2>
            <p>
              We retain data while your account is active or as needed for security, tax/accounting, and legal compliance.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">5. Sharing</h2>
            <p>
              We do not sell personal data. Data may be shared with hosting or infrastructure providers only as needed to
              operate the service, under appropriate agreements.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">6. Your rights</h2>
            <p>
              You may request access, correction, or deletion. See our{" "}
              <a className="text-primary underline underline-offset-2" href="/data-deletion">
                Data Deletion Instructions
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">7. Contact</h2>
            <p>
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
