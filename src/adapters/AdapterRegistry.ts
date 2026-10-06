import { TaxAuthorityAdapter } from "./TaxAuthorityAdapter";
import { ManualFilingAdapter } from "./ManualFilingAdapter";
import { EnuguTaxAuthorityAdapter } from "./EnuguTaxAuthorityAdapter";
import { StateAuthorityRepository } from "../rules/StateAuthorityRepository";

/**
 * Directory pattern (brief §21):
 *   TaxAuthorityAdapter
 *     ├── Federal (Nigeria Revenue Service)
 *     ├── Enugu        <- fully researched, dedicated adapter
 *     ├── Lagos        <- directory entry exists, no dedicated adapter researched yet
 *     ├── ... (34 more states)
 *
 * Every state gets SOME adapter so calling code never has to special-case "state not
 * supported yet" — but only Enugu's is backed by actual research. All others fall back to
 * a generic ManualFilingAdapter labelled with that state's authority name from the
 * directory, which will correctly refuse automatic submission until it is replaced by a
 * properly researched adapter (brief §33: a state is not PRODUCTION READY just because a
 * row exists for it).
 */
export class AdapterRegistry {
  private adapters = new Map<string, TaxAuthorityAdapter>();

  constructor(stateAuthorities: StateAuthorityRepository) {
    this.adapters.set("FEDERAL", new ManualFilingAdapter("Nigeria Revenue Service (NRS)"));
    this.adapters.set("EN", new EnuguTaxAuthorityAdapter());

    for (const profile of stateAuthorities.all()) {
      if (profile.state_code === "EN") continue; // already set above with the real adapter
      this.adapters.set(profile.state_code, new ManualFilingAdapter(profile.revenue_authority_name));
    }
  }

  get(jurisdictionKey: "FEDERAL" | string): TaxAuthorityAdapter {
    const adapter = this.adapters.get(jurisdictionKey);
    if (!adapter) {
      throw new Error(
        `No adapter registered for jurisdiction "${jurisdictionKey}". Every state must have at least a generic ` +
          `ManualFilingAdapter entry (brief §21) — this indicates a missing state_profiles.json row, not a legal gap.`
      );
    }
    return adapter;
  }

  listJurisdictions(): string[] {
    return [...this.adapters.keys()];
  }
}
