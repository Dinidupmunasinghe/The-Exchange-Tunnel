export function DataDeletion() {
  return (
    <div className="h-screen overflow-y-auto bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
        <h1 className="text-3xl font-bold">Exchange Tunnel Data Deletion Instructions</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: April 14, 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-6 text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground">Option 1: Delete from inside the app</h2>
            <p>
              Sign in to Exchange Tunnel and contact support from the in-app help area to request account deletion. We
              will verify your ownership before processing the request.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Option 2: Email request</h2>
            <p>
              Send an email to{" "}
              <a className="text-primary underline underline-offset-2" href="mailto:loomfoxdesignstudio@gmail.com">
                loomfoxdesignstudio@gmail.com
              </a>{" "}
              with subject: <strong>Data Deletion Request</strong>.
            </p>
            <p className="mt-2">
              Include your registered email and, if you know it, your SoundCloud profile URL or numeric user id as
              shown in the app or on soundcloud.com. That helps us match the correct account.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Processing timeline</h2>
            <p>
              We typically process verified requests within 7 business days. Some records may be retained longer where
              legally required (for example accounting, fraud prevention, or security logs).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">What gets deleted</h2>
            <p>
              We delete or anonymize account profile data and linked SoundCloud (and any legacy provider) tokens from
              active systems. Backups are deleted according to rolling retention schedules.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
