export function DataDeletion() {
  return (
    <div className="h-screen overflow-y-auto bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
        <h1 className="text-3xl font-bold">Data Deletion Instructions</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: April 19, 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-6 text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground">Option 1: In-app or email</h2>
            <p>Email the address below with subject: Data Deletion Request. Include the email you use in the app and, if you know it, your Telegram id from your profile or @username.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground">Contact</h2>
            <a className="text-primary underline underline-offset-2" href="mailto:loomfoxdesignstudio@gmail.com">
              loomfoxdesignstudio@gmail.com
            </a>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground">What is deleted</h2>
            <p>
              We delete or anonymize profile and linked data from our active database where technically feasible, subject
              to legal retention. Telegram&apos;s own systems are governed by Telegram; use their tools if you need
              to delete your Telegram account entirely.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
