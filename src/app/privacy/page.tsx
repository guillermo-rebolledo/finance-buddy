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
          and user ID from Google or Apple, and a profile picture reference
          when the provider supplies one. It stores the financial movements,
          notes, category names, budgets, and export snapshot records you create.
          Session records include an IP address and browser or device information
          when available. Sign-in tokens and connected-provider grants are stored
          to keep you signed in and provide the features you authorize.
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
        <h2>Google Sign-In on iPhone</h2>
        <p>
          The iPhone app includes Google&apos;s Sign-In SDK. Google may process
          account information and use your IP address to estimate a general
          location for fraud prevention. Its SDK privacy disclosures also cover
          name, email address, phone number, account and device identifiers,
          usage information, and other data for sign-in functionality and
          analytics. These are Google&apos;s SDK disclosures; Finance Buddy does
          not request your phone number or access to your device&apos;s location.
        </p>
        <p>
          See <a href="https://developers.google.com/identity/sign-in/ios/app-privacy">Google&apos;s sign-in data disclosure</a>{" "}
          and <a href="https://policies.google.com/privacy">Google&apos;s Privacy Policy</a>{" "}
          for its processing and retention practices.
        </p>
      </section>

      <section>
        <h2>Service operation</h2>
        <p>
          Our hosting and database providers process requests and maintain
          operational logs and backups. Request details, such as IP addresses,
          browser or device information, request times, and errors, help secure
          the service and diagnose failures. This processing is separate from
          the journal entries you choose to record.
        </p>
      </section>

      <section>
        <h2>What Finance Buddy does not do</h2>
        <p>
          Finance Buddy does not show advertising, sell your data, or use it
          to track you across other companies&apos; apps and websites for
          advertising. We do not run our own product analytics. Third-party
          sign-in processing is described above.
        </p>
      </section>

      <section>
        <h2>Retention and deletion</h2>
        <p>
          Your journal is kept until you delete your account. You can delete it
          from Settings on the website or iPhone. Deletion removes your
          journal and sessions from the active database. Apple-linked deletion
          requires successful Apple grant revocation; Finance Buddy also requests
          revocation of stored Google grants. Operational logs and backup copies
          are subject to the hosting and database providers&apos; retention settings.
        </p>
        <p>
          Deleting Finance Buddy does not delete your Google or Apple account
          or information retained by those providers under their own policies.
          Exported spreadsheets in your Google Drive and PDFs you saved stay
          with you.
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
