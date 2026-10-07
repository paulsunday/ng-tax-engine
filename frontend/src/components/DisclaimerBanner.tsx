import Link from "next/link";

/**
 * Standing disclaimer on the home page (not just buried in the Terms page) — the platform
 * computes real tax figures from version-controlled statutory rules, but it is not a
 * licensed tax practitioner and a company remains responsible for its own filings under
 * Nigerian law. Kept short and always visible rather than a one-time dismissible modal, so
 * it stays true every time someone lands here, not just at first signup.
 */
export function DisclaimerBanner() {
  return (
    <div className="border-b border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-800 px-6 py-3 text-xs text-yellow-900 dark:text-yellow-200">
      <strong>Disclaimer:</strong> This platform assists with accounting and tax-compliance
      calculations under Nigerian law but is not a licensed tax practitioner, chartered
      accountant, or law firm, and does not provide professional tax or legal advice. A
      calculation is withheld rather than guessed whenever its governing rule has not yet
      been approved by a qualified tax professional. Your company remains responsible for
      the accuracy and timeliness of its own tax filings.{" "}
      <Link href="/terms" className="underline font-medium">
        Read the full Terms &amp; Conditions
      </Link>
      .
    </div>
  );
}
