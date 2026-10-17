import Link from "next/link";

/**
 * Standing disclaimer on the home page (not just buried in the Terms page) — frames the
 * platform as a tool FOR accountants/auditors/tax professionals, not a replacement for one.
 * Always visible rather than a one-time dismissible modal, so it stays true every time
 * someone lands here; the headline is one line, the full wording expands on demand.
 */
export function DisclaimerBanner() {
  return (
    <div className="border-b border-warning-border bg-warning-surface text-xs text-warning-foreground">
      <details className="group max-w-6xl mx-auto px-6 py-2.5">
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <strong className="font-semibold">Built for accountants, auditors &amp; tax professionals</strong>
          {" — "}a tool for the qualified professional operating it, not a replacement for one.{" "}
          <span className="underline font-medium group-open:hidden">Read more</span>
          <span className="underline font-medium hidden group-open:inline">Show less</span>
        </summary>
        <p className="mt-2 leading-relaxed">
          This platform makes accounting, audit support, and tax-compliance filing faster and less
          error-prone for the qualified professional operating it — it is a tool for that professional
          to use, not a replacement for one, and it does not itself provide accounting, audit, or tax
          advisory services. A calculation is withheld rather than guessed whenever its governing rule
          has not yet been approved by a qualified tax professional. The accountant or firm operating
          this platform remains responsible for the accuracy and timeliness of their own or their
          clients&apos; tax filings.{" "}
          <Link href="/terms" className="underline font-medium">
            Read the full Terms &amp; Conditions
          </Link>
          .
        </p>
      </details>
    </div>
  );
}
