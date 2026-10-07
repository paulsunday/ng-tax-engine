import Link from "next/link";

/**
 * Standing disclaimer on the home page (not just buried in the Terms page) — frames the
 * platform as a tool FOR accountants/auditors/tax professionals, not a replacement for one.
 * Kept short and always visible rather than a one-time dismissible modal, so it stays true
 * every time someone lands here, not just at first signup.
 */
export function DisclaimerBanner() {
  return (
    <div className="border-b border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-800 px-6 py-3 text-xs text-yellow-900 dark:text-yellow-200">
      <strong>Built for accountants, auditors &amp; tax professionals:</strong> this platform
      makes accounting, audit support, and tax-compliance filing faster and less error-prone
      for the qualified professional operating it — it is a tool for that professional to
      use, not a replacement for one, and it does not itself provide accounting, audit, or
      tax advisory services. A calculation is withheld rather than guessed whenever its
      governing rule has not yet been approved by a qualified tax professional. The
      accountant or firm operating this platform remains responsible for the accuracy and
      timeliness of their own or their clients&apos; tax filings.{" "}
      <Link href="/terms" className="underline font-medium">
        Read the full Terms &amp; Conditions
      </Link>
      .
    </div>
  );
}
