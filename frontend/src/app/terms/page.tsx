export const TERMS_VERSION = "2026-10-07b";

export default function TermsPage() {
  return (
    <div className="max-w-2xl mx-auto mt-10 px-4 pb-20 text-sm leading-relaxed">
      <h1 className="text-xl font-semibold tracking-tight mb-2">Terms &amp; Conditions</h1>
      <p className="text-muted mb-6">Version {TERMS_VERSION}</p>

      <div className="border border-warning-border bg-warning-surface text-warning-foreground rounded-xl p-4 mb-8 text-sm">
        <strong>Not legal advice, and not exhaustive.</strong> This document is a
        general-purpose template covering the areas of Nigerian law most relevant to using
        this platform (tax administration, data protection, and general contract/consumer
        principles). It is not a substitute for review by a qualified Nigerian lawyer, and it
        does not purport to state every provision of every applicable Nigerian statute. A
        company with specific legal questions should seek independent legal advice before
        relying on it.
      </div>

      <h2 className="font-semibold mt-8 mb-2">1. Acceptance</h2>
      <p>
        By registering an organization on this platform you confirm that you are authorised
        to bind the company or entity you are registering on behalf of, and that the
        company accepts these Terms. Registration is recorded with a timestamp and the
        version of these Terms in force at that time.
      </p>

      <h2 className="font-semibold mt-8 mb-2">2. Nature of the service</h2>
      <p>
        This platform is a professional productivity tool <strong>built for accountants,
        auditors, and tax practitioners</strong> — it is designed to be operated by, or
        under the supervision of, a qualified accounting or tax professional acting for
        their own firm or for client companies, making routine accounting, audit support,
        and tax-compliance work faster and less error-prone. It is <strong>not</strong> a
        substitute for that professional, and the platform itself is not a licensed tax
        practitioner, chartered accountant, or law firm — it does not offer accounting,
        audit, or tax advisory services directly to the public, and nothing in the
        platform constitutes professional tax, accounting, or legal advice in place of
        the judgment of the qualified professional using it. Every tax calculation traces
        to a specific, version-controlled statutory rule, and a calculation is withheld
        (reported as &quot;pending rule approval&quot;) rather than guessed whenever the
        governing rule has not yet been confirmed by a qualified tax professional within
        your organization — the tool is deliberately built to defer to that professional&apos;s
        sign-off rather than act on its own authority. The accountant, auditor, or firm
        operating this platform remains solely responsible for the accuracy of any
        company&apos;s tax filings and for holding the licenses/registrations Nigerian law
        requires for the professional services they themselves provide (including, where
        applicable, the requirement under the Nigeria Tax Administration Act for certain
        filings to be certified by a professional, and any applicable FRCN, ICAN, or ANAN
        registration for the individual or firm offering those services).
      </p>

      <h2 className="font-semibold mt-8 mb-2">3. Filing with government authorities</h2>
      <p>
        No Nigerian federal or state tax authority currently offers a confirmed, officially
        documented e-filing API that this platform integrates with. Where the platform
        generates a filing package, it is for manual submission through the relevant
        authority&apos;s own official portal — the platform does not represent that any
        filing has been accepted by a tax authority merely because a package was generated
        or an attempt was recorded.
      </p>

      <h2 className="font-semibold mt-8 mb-2">4. Data protection (NDPA/NDPR)</h2>
      <p>
        We process personal data (including employee, customer, and supplier details you
        enter) as a data controller/processor under the Nigeria Data Protection Act 2023 and
        its predecessor NDPR framework. You warrant that you have a lawful basis to submit
        any personal data of third parties (e.g. your employees or customers) into the
        platform. <strong>Current data residency notice:</strong> production infrastructure
        for this platform is, as of this Terms version, hosted outside Nigeria; this is
        disclosed here in the interest of transparency and is an active item being reviewed
        for compliance with NDPA cross-border transfer requirements. We do not yet offer a
        self-service data export or erasure tool; requests can be made directly to the
        platform operator and will be handled manually until that capability is built.
      </p>

      <h2 className="font-semibold mt-8 mb-2">5. Your obligations</h2>
      <ul className="list-disc ml-5 space-y-1">
        <li>Provide accurate company, employee, customer, and transaction information.</li>
        <li>Keep your login credentials confidential and promptly report suspected compromise.</li>
        <li>Use the platform only for lawful business purposes and in compliance with applicable Nigerian law.</li>
        <li>Not attempt to circumvent access controls, probe for vulnerabilities without authorisation, or interfere with other tenants&apos; data.</li>
      </ul>

      <h2 className="font-semibold mt-8 mb-2">6. Intellectual property</h2>
      <p>
        The platform&apos;s software, rule research, and documentation remain the property of
        the platform operator. Your own company data remains yours; we do not claim ownership
        of it and use it only to provide the service to you.
      </p>

      <h2 className="font-semibold mt-8 mb-2">7. Limitation of liability</h2>
      <p>
        To the maximum extent permitted under Nigerian law, the platform is provided
        &quot;as is.&quot; We do not guarantee that any tax calculation is free of error, that
        any filing will be accepted by a government authority, or that the service will be
        uninterrupted. Nothing in these Terms excludes liability that cannot lawfully be
        excluded under Nigerian law (including liability for fraud or wilful misconduct).
      </p>

      <h2 className="font-semibold mt-8 mb-2">8. Suspension and termination</h2>
      <p>
        We may suspend or terminate access for a breach of these Terms, suspected fraud or
        unlawful use, or non-payment of any agreed fees. You may stop using the platform at
        any time; certain records (e.g. audit logs, tax records) may be retained after
        termination where Nigerian law requires their retention.
      </p>

      <h2 className="font-semibold mt-8 mb-2">9. Governing law and disputes</h2>
      <p>
        These Terms are governed by the laws of the Federal Republic of Nigeria. Any dispute
        that cannot be resolved by good-faith negotiation shall be referred to arbitration
        under the Arbitration and Mediation Act 2023, seated in Lagos, Nigeria, unless the
        parties agree otherwise in writing, without prejudice to either party&apos;s right to
        seek injunctive relief from a competent Nigerian court.
      </p>

      <h2 className="font-semibold mt-8 mb-2">10. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. Material changes will bump the version
        shown at the top of this page; continued use of the platform after a change
        constitutes acceptance of the updated Terms for new activity, but does not retroactively
        change what was agreed to at an earlier registration (the version accepted at
        registration time is always preserved on your organization&apos;s record).
      </p>

      <h2 className="font-semibold mt-8 mb-2">11. Contact</h2>
      <p>Questions about these Terms can be directed to the platform operator.</p>
    </div>
  );
}
