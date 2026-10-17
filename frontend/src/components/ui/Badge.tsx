type Tone = "neutral" | "success" | "warning" | "danger" | "primary";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-surface-muted text-muted border-border",
  success: "bg-success-surface text-success-foreground border-success-border",
  warning: "bg-warning-surface text-warning-foreground border-warning-border",
  danger: "bg-danger-surface text-danger border-danger-border",
  primary: "bg-primary/10 text-primary border-primary/20",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span data-tone={tone} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}

/**
 * Best-effort tone for an arbitrary backend status string (DRAFT, POSTED, PAID, OVERDUE,
 * ACTIVE, FAILED, ...) so every status column across the app reads consistently without
 * each page hand-rolling its own color map. Falls back to neutral for anything unmapped —
 * never guesses a color that would visually imply a state that isn't true.
 */
export function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  let tone: Tone = "neutral";
  if (["POSTED", "PAID", "ACTIVE", "APPROVED", "CALCULATED", "FILED", "CONFIRMED", "SUCCESS"].includes(s)) tone = "success";
  else if (["DRAFT", "PENDING", "PENDING_RULE_APPROVAL", "UNMATCHED", "RESEARCHED", "VERIFIED", "NOT_APPLICABLE"].includes(s)) tone = "warning";
  else if (["FAILED", "OVERDUE", "REJECTED", "CALCULATION_ERROR", "VOIDED", "MISSING_TAXPAYER_INFORMATION", "MISSING_REGULATORY_INFORMATION"].includes(s))
    tone = "danger";
  return <Badge tone={tone}>{s.replaceAll("_", " ")}</Badge>;
}
