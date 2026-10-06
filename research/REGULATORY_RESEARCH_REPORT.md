# Nigeria Tax Regulatory Research Report

**Prepared:** 2026-10-06
**Status:** Draft for tax-professional review before rule activation (see §8 Open Items)
**Scope:** Federal business taxes administered under the 2025 tax reform, as in force on the preparation date.

---

## 1. Legislative baseline — what law actually governs right now

Nigeria underwent a complete statutory rewrite in 2025. As of **1 January 2026** (i.e. currently in force), the following four Acts — collectively "the Tax Reform Acts" — govern:

| Act | Effective | Repeals / supersedes |
|---|---|---|
| **Nigeria Tax Act, 2025** (NTA) — Act No. 7 of 2025 | 1 Jan 2026 | Companies Income Tax Act, Personal Income Tax Act, Petroleum Profits Tax Act, VAT Act, Capital Gains Tax Act, Stamp Duties Act, Industrial Development (Income Tax Relief) Act |
| **Nigeria Tax Administration Act, 2025** (NTAA) — Act No. 5 of 2025 | 1 Jan 2026 | Administrative provisions previously spread across FIRS Act, CITA, PITA, VAT Act |
| **Nigeria Revenue Service (Establishment) Act, 2025** | 26 Jun 2025 | Federal Inland Revenue Service (Establishment) Act 2007 — FIRS is renamed/restructured as the **Nigeria Revenue Service (NRS)** |
| **Joint Revenue Board (Establishment) Act, 2025** | 26 Jun 2025 | Creates the Joint Revenue Board coordinating federal/state revenue authorities, plus a Tax Appeal Tribunal and Office of Tax Ombud |

**Primary-source documents obtained and parsed directly for this report** (not taken from secondary commentary):
- Nigeria Tax Act, 2025 — official gazette, 212 pp. — `irs.gm.gov.ng/docs/national/NIGERIA_TAX_ACT_2025.pdf`
- Nigeria Tax Administration Act, 2025 — official gazette, 89 pp. — `irs.gm.gov.ng/docs/national/NIGERIA_TAX_ADMINISTRATION_ACT.pdf`
- Deduction of Tax at Source (Withholding) Regulations, 2024 (S.I. No. 34 of 2024) — official gazette No. 168 — `capacityhub.org/.../Deduction of Tax at Source (Withholding) Regulatio.pdf`

Full extracted text is saved locally at `research/NTA_2025_full.txt`, `research/NTAA_2025_full.txt`, `research/WHT_Regs_2024_text.txt` for section-level citation and future diffing when amendments are gazetted.

**Critical modelling implication:** because the entire base shifted on 1 Jan 2026, *any pre-2026 accounting period must be calculated under the old regime (CITA/PITA/VAT Act/FIRS Act), and any period from 2026 onward under NTA/NTAA.* The rule engine must therefore carry both rule-sets with disjoint `effective_from`/`effective_to` ranges — this is not a hypothetical "future reform," it is the live transition boundary for every company whose financial year straddles 31 Dec 2025 / 1 Jan 2026.

---

## 2. Verified rules (source: primary legislation, text confirmed by direct extraction)

### 2.1 Companies Income Tax (CIT)

| Rule | Value | Source |
|---|---|---|
| Standard CIT rate | **30%** of total profits | NTA s.56(1)(b) |
| Small company rate | **0%** | NTA s.56(1)(a) |
| "Small company" definition | Gross turnover **≤ ₦50,000,000/yr** AND total fixed assets **≤ ₦250,000,000**; a business providing **professional services is never a small company** regardless of turnover | NTA s.56, interpretation clause (p.169 of gazette) |
| Filing deadline (annual self-assessment) | Company in business >18 months: **≤ 6 months after end of accounting year**. Newly incorporated: within 18 months of incorporation **or** 6 months after first accounting period, whichever is **earlier**. Ceasing company: ≤6 months from cessation. | NTAA s.11(5) |
| Return content | Self-assessment form, audited financial statements + capital-allowance computation (small companies may submit attested statement of accounts instead of audited financials), evidence of tax paid, effective-tax-rate computation | NTAA s.11(1) |
| Effective tax rate (minimum top-up) concept | NTA introduces an "Effective Tax Rate" mechanism (s.57) — large groups must achieve a minimum effective rate; **exact mechanics not yet fully extracted — flagged for follow-up**, see §8 | NTA s.57 |

### 2.2 Development Levy

| Rule | Value | Source |
|---|---|---|
| Rate | **4% of assessable profits** | NTA s.59(1) |
| Who is liable | All companies chargeable under Chapters 2–3 of NTA **except small companies and non-resident companies** | NTA s.59(1) |
| Collection | Collected by the Service (NRS) into a dedicated account; 10% of levy earmarked for a Defence/security infrastructure fund (Tenth Schedule) | NTA s.59(2)–(6), Tenth Schedule |
| Independence from CIT | Modelled as a **separate chargeable levy on the same profit base**, not a CIT surcharge — confirmed by its own Part X of the Act | NTA Part X |

This replaces the old earmarked levies (Tertiary Education Tax, NASENI levy, Police Trust Fund levy, IT levy) which the Development Levy consolidates, per the EY summary (secondary source, used only to corroborate; statutory confirmation is s.59 wording "all companies ... other than small companies and non-resident companies").

### 2.3 Value Added Tax (VAT)

| Rule | Value | Source |
|---|---|---|
| Standard rate | **7.5%** on value of all taxable supplies | NTA s.148 |
| Filing deadline | On/before **21st day of the month following** the tax period | NTAA s.22(1) |
| Filing ≠ payment extension | An extension of filing deadline does **not** extend the payment deadline | NTAA s.22(2) |
| Small-business exemption | Businesses meeting the "small company"/"small business" threshold are **not required** to register, charge VAT, or file monthly returns, but may elect in writing to opt in; once a business outgrows the threshold it must resume monthly filing | NTAA s.22(4)–(6) |
| Threshold computation | In testing the small-business threshold, **exclude**: supply of a capital asset, and supply made solely because the business is being sold/wound up | NTAA s.22(7) |
| Non-resident suppliers | Must register and charge VAT on supplies into Nigeria; where a non-resident supplies from outside Nigeria, the **Nigerian recipient must self-withhold the VAT** and remit it | NTA s.150 |
| Zero-rating / exemptions | Exports zero-rated with full input recovery; humanitarian goods and assistive devices exempt (confirmed by EY alert; exact schedule paragraphs not yet pulled from primary text — follow-up item) | NTA (schedule TBD), EY alert |

**Open item:** The NTAA references a VAT "small business" exemption but the actual numeric turnover threshold for VAT-specific registration is not restated independently in the NTAA text found — it appears to inherit the NTA s.56 "small company" ₦50m turnover / ₦250m fixed-assets definition. This cross-reference should be confirmed against NRS implementation guidance before being hard-coded; until then the rule is flagged `requires_review` rather than `active` (see §8).

### 2.4 Personal Income Tax / PAYE

Fourth Schedule, NTA s.58(1) — progressive bands applied **after** relief allowances/exemptions under s.30:

| Band | Rate |
|---|---|
| First ₦800,000 | 0% |
| Next ₦2,200,000 | 15% |
| Next ₦9,000,000 | 18% |
| Next ₦13,000,000 | 21% |
| Next ₦25,000,000 | 23% |
| Above ₦50,000,000 (cumulative above ₦50,000,000) | 25% |

| Rule | Value | Source |
|---|---|---|
| Rent relief | 20% of annual rent paid, **capped at ₦500,000** (lower of the two), conditional on accurate declaration | NTA s.30(2)(a)(vi) |
| Minimum wage earners | Individuals earning the statutory minimum wage are excluded from this table (taxed per Minimum Wage Act provisions) | NTA s.58 chapeau |
| Employer annual PAYE return | Due **not later than 31 January** following the tax year, covering all emoluments paid to employees in the preceding year | NTAA s.14(1) |
| Simplified returns | Relevant tax authority may prescribe simplified returns for low-income/informal-sector taxpayers | NTAA s.15 |
| State jurisdiction | PAYE is administered by the **State Internal Revenue Service** of the state where the employee is resident — confirmed structurally by NTAA's "relevant tax authority" framework and the Joint Revenue Board Act's state-coordination role; employees in different states are not interchangeable for PAYE purposes | NTAA jurisdiction provisions (Part I), JRB Act |

**Note on CRA:** NTA 2025 **replaces** the old Personal Income Tax Act's Consolidated Relief Allowance (20% of gross income + ₦200,000) with the rent-relief mechanism above. Any legacy code or spreadsheet still applying CRA is calculating under the **repealed** regime and must only be used for pre-2026 periods.

### 2.5 Withholding Tax (WHT)

The NTA/NTAA **do not restate WHT rates themselves** — NTAA s.51(1) delegates the rate to "regulations relating to deduction of tax at source." The currently governing subsidiary legislation is the **Deduction of Tax at Source (Withholding) Regulations, 2024** (S.I. No. 34 of 2024, Minister of Finance, gazetted 2 Oct 2024, effective 1 Jan 2025, with early-adoption option from 1 Jul 2024). This was made under the now-repealed CITA/PPTA/PITA/CGTA but NTAA s.51 and its transitional provisions keep it operative pending replacement regulations under the new Acts.

**First Schedule rate table** (rates by recipient type):

| Transaction | Resident corporate | Non-resident corporate | Resident non-corporate | Non-resident non-corporate |
|---|---|---|---|---|
| Dividend, Interest | 10% | 10% | 10% | 10% |
| Royalty | 10% | 10% | 5% | 5% |
| Rent, Hire, Lease | 10% | 10% | 10% | 10% |
| Commission/consultancy/technical/management/professional fees | 5% | 10% | 5% | 10% |
| Supply of goods/materials (not by manufacturer/producer) | 2% | N/A | 2% | N/A |
| Co-location & telecom tower services | 2% | 5% | 2% | 5% |
| Supply/rendering of services (other) | 2% | 5% | 2% | 5% |
| Construction of roads, bridges, buildings, power plants | 2% | 5% | 2% | 5% |
| Other construction & related activities | 5% | 10% | 5% | 10% |
| Brokerage fee | 5% | 10% | 5% | 10% |
| Directors' fees | N/A | N/A | 15% | 20% |
| Compensation for loss of employment (CGT Act s.36) | N/A | N/A | 10% | 10% |
| Entertainers / sportspersons (Nigeria-sourced) | N/A | 15% | N/A | 15% |
| Lottery/gaming/reality-show winnings (from 1 Jan 2025) | N/A | N/A | 5% | 15% |

Other confirmed rules:
- **No TIN penalty**: where the recipient has no Tax ID, for non-passive-income transactions (goods/services), the deduction rate **doubles**. (Reg. 3(c))
- **Small-supplier exemption**: a small company (as defined under **s.105 of the old CITA**) is exempt from suffering WHT deduction where it has a valid TIN **and** the transaction value is **≤ ₦2,000,000 in the relevant calendar month**. (Reg. 4(2)) — flagged in §8 as needing confirmation the definition now maps to NTA s.56.
- **Treaty rates** override where a ratified Double Taxation Treaty specifies a lower rate for a treaty-resident recipient. (Reg. 3(b))
- **Deduction is an advance/final tax, not a cost**: cannot be grossed up into the contract price. (Reg. 5)
- **15 explicit exemptions** from WHT deduction (Reg. 10(1)), including: securities-lending compensating payments, REIT/REIC distributions, over-the-counter transactions, bank interest on direct-debited deposits, own-manufactured goods, imported goods without Nigerian taxable presence, exempt income, telecom/internet/airline tickets, reimbursed out-of-pocket expenses, insurance premiums, specified petroleum products (LPG/CNG/PMS/AGO/LPFO/DPK/JET-A1), broker's retained commission, and specified charitable/educational game winnings.
- **Remittance deadline — conflicting sources, resolved by precedence**: Reg. 7(1) (subsidiary, 2024) sets **21st day** for Federal (NRS) remittance, but **10th day** (CGT/PAYE) or **30th day** (other) for State IRS remittance. NTAA s.107(1) (primary legislation, commencing 2026) sets a **uniform 21st day** for *all* deducted/collected/withheld tax regardless of authority. Because NTAA is later-in-time primary legislation displacing the Acts under which the 2024 Regulations were made, **the engine should treat the 21st-day rule (NTAA s.107) as the governing deadline from 1 Jan 2026**, while surfacing the State-specific 10th/30th-day language as a `requires_review` conflict pending explicit NRS/JRB confirmation (see §8).
- **Penalty for failure to deduct**: 40% of the amount not deducted (NTAA s.105).
- **Penalty for failure to remit**: amount due + 10% p.a. administrative penalty + interest at the prevailing **CBN Monetary Policy Rate** (NTAA s.107).

### 2.6 Capital Allowances

First Schedule, Part I, Table I (NTA):

| Class | Rate | Qualifying expenditure |
|---|---|---|
| 1 | **10%** | Building, Agricultural, Mast, Intangible assets, Heavy Transportation |
| 2 | **20%** | Plant, Agricultural Equipment, Furniture & Fittings, Mining, Other Equipment |
| 3 | **25%** | Motor Vehicle, Software, Other Capital Expenditure |

Other confirmed rules:
- **No initial allowance** — the Act grants only the annual allowance in the table above (the old CITA/ITA "initial allowance" uplift in year 1 is **abolished**). Confirmed structurally: NTA s.27(1)–(2) and First Schedule Part I para 6 reference only a single "capital allowance ... at the rate specified in Table I," with no separate initial-allowance paragraph.
- **1% notional residual value** recorded for statistical purposes until disposal; does not change the amount actually claimable. (First Schedule Part I para 6(a), and transitional para 23(2))
- **Pro-rated for short periods**: where the basis period is <1 year, allowance is time-apportioned. (para 6(b))
- **Partial business use**: allowance is pro-rated to the taxable-use portion unless non-taxable income is <10% of total income, in which case no pro-ration is required. (NTA s.27(3)–(4))
- **Transitional rule for pre-2026 assets**: remaining allowance periods = (statutory years allowable under NTA) − (years already claimed under the old Act); if the old Act already granted allowances for ≥ the new Act's allowable years, a single residual allowance is granted at commencement, subject to the 1% notional retention. (First Schedule Part I para 23)
- A **separate Part II** of the First Schedule governs upstream petroleum capital allowances (20% p.a. acquisition-cost allowance for petroleum rights) — out of scope for a general business engine unless the platform targets oil & gas clients.

The platform's capital allowance register must be a **distinct ledger from the accounting depreciation schedule** — confirmed as a design requirement by the Act's own separate "qualifying capital expenditure," "residue," and "disposal" machinery (First Schedule Part I paras 7–9), which has no reference to accounting depreciation policy at all.

### 2.7 Tax Losses

| Rule | Value | Source |
|---|---|---|
| Carry-forward | Indefinite — "deducted ... in subsequent years until the loss is fully recouped" | NTA s.27(5)(c) |
| Carry-back | Not permitted (no provision exists for it; confirmed by absence in s.27 and by secondary commentary) | NTA s.27 |
| Ring-fencing by trade | A loss may only be deducted from the **same trade/business** that generated it | NTA s.27(5)(b) |
| Cap on deduction | Aggregate loss deduction can never exceed the loss itself (anti-double-count rule, not a utilisation-percentage cap) | NTA s.27(5)(a) |
| Digital/virtual asset losses | Ring-fenced — only deductible against profits from digital/virtual-asset business | NTA s.27(6) |
| Order of application | Loss relief and capital allowance relief are both applied in arriving at total profits per s.27(1); capital allowance is capped by/linked to the activity generating the assessable profit when "priority activities" incentives are involved | NTA s.27(1), (5) |

No explicit statutory time-limit or percentage-of-profit cap was found in the sections reviewed (unlike some other jurisdictions). This should still be re-confirmed against the Fifth/Sixth Schedules (settlements/trusts, partnerships) and petroleum-specific loss rules before being treated as universal.

---

## 3. Tax authority structure (for jurisdiction routing)

- **Nigeria Revenue Service (NRS)** — successor to FIRS, effective 26 Jun 2025 (Nigeria Revenue Service (Establishment) Act 2025). Administers CIT, VAT, Development Levy, WHT for federal purposes, and PAYE/CGT/PIT matters that fall federally (e.g. non-resident individuals, FCT, armed forces, police, external affairs officers — per the historical PITA federal/state split, now carried into NTAA's "relevant tax authority" definitions).
- **State Internal Revenue Services (SIRS)** — administer PAYE and other state taxes for resident individuals in their state.
- **Joint Revenue Board (JRB)** — created by the Joint Revenue Board (Establishment) Act 2025; coordinates federal/state tax administration, hosts the **Tax Appeal Tribunal** and **Office of the Tax Ombud**.
- **Local Government** — levies outside the scope of this report (tenement rates, etc.) are not addressed; flagged as out of scope pending a specific requirement.

This matters architecturally: a "relevant tax authority" lookup is not a constant — it depends on tax type **and** taxpayer category **and**, for individuals, state of residence. The engine's jurisdiction resolver must be a first-class component, not a hardcoded field.

---

## 4. Regulatory matrix (§36 deliverable)

| Tax | Applicable taxpayer | Tax base | Rate | Filing frequency | Filing deadline | Payment deadline | Effective date | Authority | Source |
|---|---|---|---|---|---|---|---|---|---|
| CIT | All companies (resident & non-resident with Nigerian source income); 0% if "small company" | Total profits (assessable profits − capital allowances − losses) | 30% (0% small co.) | Annual | ≤6 months after accounting year end | With return, or by instalments per s.11 regime | 1 Jan 2026 | NRS | NTA s.56, NTAA s.11 |
| Development Levy | All companies except small companies & non-residents | Assessable profits | 4% | Annual (with CIT return) | Same as CIT | Same as CIT | 1 Jan 2026 | NRS | NTA s.59 |
| VAT | Taxable persons above small-business threshold | Value of taxable supplies | 7.5% | Monthly | 21st of following month | 21st of following month (no grace from filing extension) | 1 Jan 2026 (rate continued from pre-reform VAT Act) | NRS | NTA s.148, NTAA s.22 |
| WHT | Specified payers (bodies corporate, govt, statutory bodies, etc.) on specified transactions | Gross payment per transaction category | 2%–25% by category (table in §2.5) | Monthly (per deduction event) | 21st of following month (NTAA s.107; see conflict note §2.5/§8) | Same as filing | Regs: 1 Jan 2025 / NTAA: 1 Jan 2026 | NRS (federal) / SIRS (state-collected heads) | WHT Regs 2024, NTAA s.51 & s.107 |
| PAYE | Employees with Nigerian employment income, by employer deduction | Taxable employment income after reliefs | 0–25% progressive (Fourth Schedule) | Monthly deduction; annual employer return | Annual return ≤31 Jan; monthly remittance — **exact day requires confirmation**, see §8 | Same as filing | 1 Jan 2026 | SIRS (state of employee residence) | NTA s.58, NTAA s.14 |

All cells above are sourced from primary legislation extracted directly, except the explicit "requires confirmation" callouts.

---

## 5. Taxpayer classification factors identified in the statute

- **Small company** (NTA s.56 definition): turnover ≤ ₦50m AND fixed assets ≤ ₦250m AND not a professional-services business. Drives: CIT rate, Development Levy liability, VAT registration/filing obligation (pending confirmation), audited-accounts requirement.
- **Resident vs non-resident company**: drives Development Levy exemption, WHT finality-of-tax treatment, VAT self-withholding obligations on inbound non-resident supplies.
- **Resident vs non-resident individual**: drives PAYE/PIT jurisdiction and WHT rate tier (non-resident rates are generally double the resident non-corporate rate in the WHT table).
- **Corporate vs non-corporate recipient**: a distinct WHT rate axis, independent of resident/non-resident.
- **Professional-services business**: excluded from small-company status regardless of turnover — a sector-specific override that must be modelled as its own classification flag, not inferred from turnover alone.
- **Newly incorporated vs established company**: changes the CIT filing deadline formula (NTAA s.11(5)(b)).
- **Petroleum/upstream operations**: entirely separate chargeable regime (Hydrocarbon Tax / Chapter Three of NTA) with its own capital allowance table (First Schedule Part II) and royalty/filing rules — out of scope unless the platform serves oil & gas clients, but the classification flag must exist so such companies are routed away from the general CIT/Capital-Allowance engine rather than silently mis-taxed.

---

## 6. Database / rule-record mapping

Every numeric figure in §2 has been encoded as a candidate rule record (see `research/rule_seed_data.json`) carrying: `tax_type`, `rule_key`, `value`, `jurisdiction`, `effective_from`, `effective_to`, `source_document`, `source_url`, `source_reference` (section/paragraph), `rule_version`, `status`, `verification_date`, `verified_by`. Pre-2026 equivalents (old CITA 30% flat rate with no small-company 0% band, old CRA-based PAYE relief, old WHT-less-granular rate table where applicable, old VAT Act rate history including the 2020 increase from 5%→7.5%) are **not yet populated** — they are needed only if the platform must reproduce historical (pre-2026) filings, which is explicitly required by §25 of the brief ("historical calculations must remain reproducible"). This is listed as an open item in §8.

---

## 7. Confidence classification applied to this report's findings

| Finding | Confidence |
|---|---|
| CIT rate/small-company definition, Dev Levy rate/scope, VAT rate, PAYE bands/rent relief, Capital Allowance Table I, loss carry-forward mechanics, CIT/VAT/PAYE filing deadlines, WHT rate table, WHT exemptions, WHT penalty regime | **Verified Rule** — confirmed by direct extraction of official gazette text, section-cited above |
| VAT small-business registration threshold numeric linkage to NTA s.56 | **Requires Review** — mechanism implied but not found restated verbatim in NTAA VAT Part |
| WHT remittance deadline (state-collected heads) | **Potential Regulatory Change / Conflict** — subsidiary regulation (10th/30th day) vs. primary Act (21st day); needs NRS/JRB clarification |
| Monthly PAYE remittance due-date (as opposed to the annual 31 Jan return) | **Missing Regulatory Information** — not located in the sections reviewed; historically 10th of the following month under PAYE Regulations 2002/Finance Act amendments, continuity not yet confirmed under NTAA |
| Effective Tax Rate / minimum top-up regime (NTA s.57) | **Requires Review** — provision identified but mechanics not yet fully extracted |
| VAT zero-rating/exemption schedule detail (humanitarian goods, exports) | **Requires Review** — confirmed in principle by secondary (EY) source; exact schedule paragraph not yet pulled from primary text |
| Pre-2026 (legacy) rule set for historical reproducibility | **Missing Regulatory Information** — not yet researched in this pass; required before any pre-2026 return can be processed |
| Stamp Duties, Capital Gains Tax (now folded into NTA), state-level consumption/signage/land-use taxes | **Unsupported Scenario** — out of scope of this research pass |

No figure in §2 was sourced from a blog, forum, or unverified aggregator; several blog/aggregator figures encountered during search (e.g. a ₦100m small-company turnover threshold, and a VAT-specific ₦25m registration threshold) were found to be **inconsistent with the primary text** (correct figure: ₦50m turnover / ₦250m fixed assets per NTA s.56) and are explicitly rejected in this report.

---

## 8. Open items requiring tax-professional sign-off before rule activation

1. Confirm VAT small-business numeric threshold is indeed NTA s.56's ₦50m/₦250m test (not a separate VAT-specific number).
2. Resolve the WHT remittance-deadline conflict (NTAA s.107 "21st day" vs. WHT Regs 2024 reg.7 "10th/30th day for state heads") with NRS/JRB guidance or a published transitional notice.
3. Locate the monthly PAYE remittance due-date provision under the new Act (distinct from the 31 Jan annual employer return).
4. Fully extract NTA s.57 "Effective Tax Rate" mechanics (appears targeted at large groups — likely a Pillar-Two-style minimum top-up).
5. Pull exact VAT exemption/zero-rating schedule paragraphs (exports, humanitarian goods, assistive devices, basic food items carried over from the old VAT Act's First Schedule, if carried over at all).
6. Build the **pre-2026 legacy rule set** (CITA/PITA/old VAT Act/old WHT practice) so historical returns remain reproducible per the historical-calculation requirement — this report only covers the current (2026+) regime.
7. Confirm whether the WHT Regs 2024 "small company" cross-reference (old CITA s.105) has been administratively updated to NTA s.56 or remains a live definitional gap.
8. Research State-level taxes (business premises levy, land use charge, signage, etc.) — explicitly required by the brief, not yet started.
9. Confirm whether any official NRS/FIRS/State IRS API exists for e-filing integration (brief §30–31) — not yet researched.

**None of the items in this section are implemented as "active" rules in the seed data — they are seeded with `status: requires_review` so the engine never silently applies an unverified figure.**

---

## 9. ADDENDUM — State/FCT jurisdiction layer (36 states + FCT)

Added after the federal pass, in response to the requirement that the platform be jurisdiction-aware across all 36 states and the FCT, not Lagos/Enugu-centric.

### 9.1 Coverage status (brief §32-33)

| Tier | Count | States |
|---|---|---|
| `FULLY_RESEARCHED` — live official site browsed directly, page content read | 1 | Enugu |
| `WEBSITE_CONFIRMED` — official domain + authority name cross-checked via direct search, page content not yet read | 2 | Lagos, FCT |
| `LOCATED_SECONDARY_SOURCE_UNVERIFIED` — URL/name sourced from a third-party 2026 tax-portal directory blog, not yet independently confirmed | 34 | All remaining states |

Full directory: `research/state_profiles.json`. **No state other than Enugu has any rate, threshold, or deadline asserted** — every other state's levies are explicitly `"Requires regulatory verification"`. The 34 `LOCATED_SECONDARY_SOURCE_UNVERIFIED` rows are a **todo list**, not research output — each needs the same browse-the-official-site pass given to Enugu before its specific obligations can be quantified. Treat "a row exists" and "this state is supported" as different claims, per brief §33 ("a state must not be marked PRODUCTION READY merely because its website exists").

### 9.2 Enugu — fully researched (brief §8-9)

Source: direct browse of `https://irs.en.gov.ng` (Tax Systems, Tax Legislation, FAQ, About Us pages), 2026-10-06.

- **Authority:** Enugu State Internal Revenue Service (ESIRS/EIRS), Executive Chairman Emmanuel Ekene Nnamani (FCA).
- **Taxpayer ID:** ESBN — confirmed to mean **"Enugu State Social Benefit Number"** (not "Business Number" as might be assumed; verified directly from the official FAQ rather than guessed).
- **Online capability confirmed:** self-service registration (OTP-verified), bill/invoice-based "Consolidated Demand Notice" payment, ESBN lookup/retrieval, Tax Clearance Certificate issuance (requires the preceding 3 years assessed and paid). Approved payment gateways: Remita, Flutterwave, Interswitch, e-Transact, Moniepoint, Sayswitch, Unified Payments.
- **No API found:** no developer documentation, sandbox, or machine-to-machine integration endpoint exists anywhere on the official site. The portal ("EnuguCMS") is a human self-service web app only. Per brief §11, `EnuguTaxAuthorityAdapter` (see `src/adapters/EnuguTaxAuthorityAdapter.ts`) is therefore manual/guided-filing only — `supportsAutomaticSubmission: false` — and must stay that way until ESIRS publishes an actual API.
- **Revenue lines observed** (names only; rates not independently verified against the Financial Law text itself): PAYE (Companies/Federal/State/Local-Government/Arrears variants), WHT on bank interest/dividends/directors' fees/rent/royalty (stated as 10% on the site) and on payments to contractors (stated as 5%), Direct Assessment Tax, Capital Gains Tax (individuals), Enugu State Property and Land Use Tax, Purchase Tax on Hotels, Education Development Levy, Infrastructural Development Levy, Mortuary Levy, Mining Truck Tax, Drivers Licences, Road Traffic Exam fees, Penalties Tax.
- **Applicable legislation named on-site:** Personal Income Tax Act (federal); **Financial Law of Enugu State**; **Amendment of the Financial Law 2016**; **Enugu State Land Use Charge Law, No. 7 of 2016** (replaces Tenement Rates and Ground Rent, adds a Neighbourhood Improvement Levy). A secondary news source cites illustrative Land Use Charge figures (₦15,000–₦300,000/yr depending on location) and an ₦18,000/yr informal-sector presumptive levy — **both explicitly unverified** against the Law's actual text and must not be used in a calculation.
- **Filing/payment deadlines, penalty formulas, and interest rates:** not found in structured form on the official site — `Requires regulatory verification`.

### 9.3 Jurisdiction engine behavior (brief §1-3, §12-18)

`src/engine/jurisdiction.ts` builds one federal-obligation row per applicable federal tax (unaffected by how many states are touched) plus one row per **distinct state actually touched** — head office, every branch with business premises, and every employee's state of residence (work-state, if different, is logged and flagged for review rather than silently resolved either way). A company is never collapsed to "registered state only." Confidence is driven directly by that state's `verification_status`: Enugu's PAYE row gets `VERIFIED_RULE`; every other touched state gets `REQUIRES_REVIEW` or `MISSING_REGULATORY_INFORMATION` with the literal text "Current official regulatory source could not be verified" (brief §31's exact required wording) rather than borrowing Enugu's figures or a national default. Verified in `tests/jurisdiction.test.ts` using the brief's own worked example (Enugu HQ + Lagos/FCT branches + an Anambra-resident, Lagos-working employee).

### 9.4 Regulatory monitoring of state sources — a confirmed technical limitation

`monitoring/monitor.py` (brief §21/§24/§39's DETECT step) was run live against the federal gazette PDFs and the three Enugu pages above. It successfully baselines the federal PDFs. For the Enugu HTML pages, **it discovered empirically that `irs.en.gov.ng` is a JavaScript-rendered single-page app**: a plain HTTP fetch returns only an 83-character loading shell ("You need to enable JavaScript to run this app."), not the real page. The monitor now prints an explicit `[WARN]` for any non-PDF source under 500 characters rather than silently treating a useless baseline as real coverage. Fixing this for real monitoring of ESIRS (and likely most other state portals, which appear to use the same platform) requires a headless-browser fetch rather than a plain HTTP request — not yet implemented. This is listed here rather than hidden, per the brief's "never hide uncertainty" principle.

### 9.5 Open items — state layer

1. Full browse-the-official-site research pass for the remaining 35 states/FCT (Lagos and FCT have only a confirmed URL/name so far; the other 34 are secondary-sourced URLs needing independent confirmation).
2. Verify Enugu's Land Use Charge rate schedule against the actual Law No. 7 of 2016 text (not yet located as a directly fetchable document).
3. Verify Enugu's WHT sub-rates (10%/5% as displayed on the Tax Systems page) against the Financial Law text itself, since the site lists them as labels rather than a cited schedule.
4. Determine, for PAYE jurisdiction generally, whether current law ever turns on an employee's **work** state rather than **residence** state (the engine currently assumes residence, consistent with historical PITA practice, and flags any work/residence mismatch for professional review rather than asserting an answer).
5. Upgrade `monitoring/monitor.py` to a headless-browser fetch before relying on it for any state portal's content.
6. Determine whether any state (or the NRS/JRB) has published a real, documented e-filing API — none was found for Enugu, Lagos, or FCT in this pass, and none was assumed for the remaining 34.
