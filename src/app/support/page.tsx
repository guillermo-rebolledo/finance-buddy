import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/components/public-page";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Support · Finance Buddy",
  description: "Help with signing in, exports, and your Finance Buddy journal.",
};

export default function Support() {
  return (
    <PublicPage
      title="Support"
      description="Short answers to common questions about your Finance Buddy journal."
    >
      <section>
        <h2>Contact</h2>
        <p>
          If you still need help, email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </section>

      <section>
        <h2>How do I sign in with Google or Apple?</h2>
        <p>
          Choose Google or Apple on the sign-in screen. A verified email
          address is required. If both providers use the same verified email,
          they open the same journal.
        </p>
      </section>

      <section>
        <h2>Why did Hide My Email open a separate journal?</h2>
        <p>
          Apple Hide My Email gives Finance Buddy a private relay address. It
          is different from your Google or regular Apple email, so it belongs
          to a separate user identity and opens a separate journal.
        </p>
      </section>

      <section>
        <h2>How do I connect Google Sheets?</h2>
        <p>
          Sign in on the Finance Buddy website, open Dashboard, and choose
          Connect Google Sheets export. The iPhone app can use that connection
          afterward. Finance Buddy asks only for access to spreadsheets it
          creates.
        </p>
      </section>

      <section>
        <h2>How do I export a PDF?</h2>
        <p>
          Open Dashboard, select the day, week, or month you want, and choose
          Export PDF. The PDF is a snapshot you can save, print, or share.
        </p>
      </section>

      <section>
        <h2>How do I delete my account?</h2>
        <p>
          Open Settings on the website or iPhone and choose Delete account.
          This permanently deletes the journal and signs it out everywhere.
          Spreadsheets already in Google Drive and PDFs you saved stay with
          you.
        </p>
      </section>

      <p className="border-t pt-6 text-sm text-muted-foreground">
        Read the <Link href="/privacy">Privacy Policy</Link> for details about
        how your data is handled.
      </p>
    </PublicPage>
  );
}
