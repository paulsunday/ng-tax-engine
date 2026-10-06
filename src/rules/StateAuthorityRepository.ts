import * as fs from "fs";
import * as path from "path";
import { StateAuthorityProfile } from "../types/jurisdiction";

interface StateProfilesFile {
  states: StateAuthorityProfile[];
}

/**
 * Loads research/state_profiles.json — the state revenue authority directory (brief §22).
 * This is a REFERENCE directory, not a rule source: it answers "who administers tax here
 * and how verified is our information about them", never "what is the rate/deadline".
 */
export class StateAuthorityRepository {
  private profiles: Map<string, StateAuthorityProfile>;

  // process.cwd(), not __dirname — see the same fix/rationale in JsonRuleRepository.ts.
  constructor(filePath: string = path.join(process.cwd(), "research", "state_profiles.json")) {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed: StateProfilesFile = JSON.parse(raw);
    this.profiles = new Map(parsed.states.map((s) => [s.state_code, s]));
  }

  get(stateCode: string): StateAuthorityProfile | undefined {
    return this.profiles.get(stateCode);
  }

  getOrThrow(stateCode: string): StateAuthorityProfile {
    const profile = this.profiles.get(stateCode);
    if (!profile) {
      throw new Error(
        `No state revenue authority record for state code "${stateCode}" — every one of the 36 states + FCT must ` +
          `have a directory row (brief §32); add one (even if LOCATED_SECONDARY_SOURCE_UNVERIFIED) before using this state.`
      );
    }
    return profile;
  }

  all(): StateAuthorityProfile[] {
    return [...this.profiles.values()];
  }
}
