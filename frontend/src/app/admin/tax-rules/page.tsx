"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

interface RuleVersion {
  id: string;
  ruleVersion: string;
  status: string;
  effectiveFrom: string;
  taxRule: { ruleKey: string; taxType: string; jurisdiction: string; description: string };
}

function AdminTaxRulesPage() {
  const { claims } = useAuth();
  const [pending, setPending] = useState<RuleVersion[] | null>(null);
  const [all, setAll] = useState<RuleVersion[] | null>(null);

  useEffect(() => {
    api.get<RuleVersion[]>("/tax-rule-governance/rules/pending").then(setPending).catch(() => setPending([]));
    api.get<RuleVersion[]>("/tax-rule-governance/rules").then(setAll).catch(() => setAll([]));
  }, []);

  if (!claims?.isPlatformAdmin && !claims?.isTaxRuleApprover) {
    return (
      <div className="max-w-2xl mx-auto mt-10 px-4 text-sm">
        <p className="text-muted">
          This page is restricted to platform administrators and designated tax-rule approvers. A real, qualified tax
          professional must review and approve each statutory rule before it can drive a calculation — this is a
          deliberate gate (mandate §1), not a missing permission.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto mt-10 px-4 pb-16">
      <PageHeader
        title="Tax Rule Governance"
        subtitle="No calculation uses a rule until it reaches ACTIVE status via this real approval workflow — AI research/verification never substitutes for a qualified professional's sign-off here."
      />

      <h2 className="text-sm font-semibold mb-2">Pending your approval</h2>
      {pending?.length === 0 && <EmptyState>Nothing pending.</EmptyState>}
      <ul className="flex flex-col gap-2 mb-8">
        {pending?.map((r) => (
          <RuleRow key={r.id} rule={r} />
        ))}
      </ul>

      <h2 className="text-sm font-semibold mb-2">All rule versions</h2>
      <ul className="flex flex-col gap-2">
        {all?.map((r) => (
          <RuleRow key={r.id} rule={r} />
        ))}
      </ul>
    </div>
  );
}

function RuleRow({ rule }: { rule: RuleVersion }) {
  return (
    <li>
      <Link href={`/admin/tax-rules/${rule.id}`}>
        <Card className="hover:border-primary/40 transition-colors !p-4">
          <div className="flex justify-between">
            <span className="font-medium">{rule.taxRule.ruleKey}</span>
            <Badge>{rule.status}</Badge>
          </div>
          <div className="text-muted text-xs mt-1">
            {rule.taxRule.taxType} · {rule.taxRule.jurisdiction} · v{rule.ruleVersion} · effective {new Date(rule.effectiveFrom).toLocaleDateString()}
          </div>
        </Card>
      </Link>
    </li>
  );
}

export default function Page() {
  return (
    <RequireAuth requireOrganization={false}>
      <AdminTaxRulesPage />
    </RequireAuth>
  );
}
