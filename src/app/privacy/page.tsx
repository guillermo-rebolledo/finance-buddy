import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/components/public-page";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy · Finance Buddy",
  description: "How Finance Buddy collects, uses, and protects your data.",
};

export default function Privacy() {
  return (
    <PublicPage
      title="Privacy Policy"
      description="Finance Buddy is a private journal for understanding your own income and spending. This policy explains the data needed to provide it."
    >
      <section>
        <h2>What Finance Buddy collects</h2>
        <p>
          When you sign in, Finance Buddy receives your name, email address,
          and user ID from Google or Apple. It stores the financial movements,
          categories, budgets, and export snapshot records you create, along
          with session records that keep you signed in securely.
        </p>
      </section>

      <section>
        <h2>Why this data is used</h2>
        <p>
          This data is used only to run your personal journal: to identify
          you, keep your records private, show your summaries and budgets, and
          create exports when you ask for them.
        </p>
      </section>

      <section>
        <h2>Who processes the data</h2>
        <ul>
          <li>Vercel hosts the website and server.</li>
          <li>Neon stores the journal and session data in its database.</li>
          <li>Google and Apple process sign-in through their services.</li>
          <li>
            Google Sheets processes an export only when you choose to export
            your journal to Google Sheets.
          </li>
        </ul>
      </section>

      <section>
        <h2>What Finance Buddy does not do</h2>
        <p>
          Finance Buddy does not track you, show advertising, use analytics,
          or sell your data.
        </p>
      </section>

      <section>
        <h2>Retention and deletion</h2>
        <p>
          Your data is kept until you delete your account. You can delete it
          from Settings on the website or iPhone. Deletion removes your
          journal and sessions and revokes provider grants held by Finance
          Buddy.
        </p>
        <p>
          Export snapshots already saved as spreadsheets in your Google Drive
          stay with you and are not deleted from your Drive.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Questions about privacy can be sent to{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. For common
          questions, visit <Link href="/support">Support</Link>.
        </p>
      </section>

      <p className="border-t pt-6 text-sm text-muted-foreground">
        Last updated: September 15, 2026
      </p>
    </PublicPage>
  );
}
