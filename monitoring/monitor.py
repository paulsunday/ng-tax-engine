#!/usr/bin/env python3
"""
Regulatory source monitor (brief §21, §24, §39).

Detect -> Review -> Validate -> Approve -> New rule version -> Test -> Deploy.

This script only performs the DETECT step. It:
  1. Fetches each official source listed in sources.json (and optionally every state's
     official_website from research/state_profiles.json).
  2. Computes a content hash of the extracted text (PDF text via pypdf, HTML text via a
     simple tag-stripping pass).
  3. Compares against the previously recorded hash in monitoring/state/hashes.json.
  4. If the hash changed (or this is the first time a source is seen), writes a
     RegulatoryChangeRecord JSON file into monitoring/change_log/ with review_status
     "PENDING" and a snippet of the new content for a human to look at.

KNOWN LIMITATION (confirmed empirically during testing, not hypothetical): irs.en.gov.ng,
and likely other state portals built the same way, are JavaScript-rendered single-page
apps. A plain HTTP fetch (what this script does) only retrieves the pre-render loading
shell — e.g. "You need to enable JavaScript to run this app." — not the real page content
a browser would show. Such a source's hash stays constant even if the real content
changes, which would give false confidence. Sources flagged "known_limitation" in
sources.json are not providing working coverage yet; fetch_bytes() would need to be
replaced with a headless-browser render for those to actually work. This script still
polls them so the gap stays visible (via extract_text() length) instead of being hidden.

It NEVER edits research/rule_seed_data.json or research/state_profiles.json. A change
record sitting in monitoring/change_log/ is a prompt for human review, not an applied
change. Promoting a detected change into an actual rule version is a separate, manual
step that belongs to a tax professional (see brief §42), not to this script.

Usage:
    python monitor.py                     # poll the curated sources.json list only
    python monitor.py --watch-all-states   # also poll every state's official_website
    python monitor.py --dry-run            # fetch and hash, but write nothing

Exit code is always 0 on a successful poll (change or no change) and non-zero only on a
script-level failure (e.g. sources.json missing) — a detected regulatory change is a
normal, expected outcome, not an error.
"""
import argparse
import hashlib
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MONITORING_DIR = ROOT / "monitoring"
STATE_DIR = MONITORING_DIR / "state"
CHANGE_LOG_DIR = MONITORING_DIR / "change_log"
HASHES_FILE = STATE_DIR / "hashes.json"
SOURCES_FILE = MONITORING_DIR / "sources.json"
STATE_PROFILES_FILE = ROOT / "research" / "state_profiles.json"

USER_AGENT = "Mozilla/5.0 (compatible; NG-TaxEngine-RegulatoryMonitor/1.0; +internal-use)"


def fetch_bytes(url: str, timeout: int = 30) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def extract_text(url: str, raw: bytes, kind: str) -> str:
    if kind == "pdf":
        try:
            from pypdf import PdfReader
            import io

            reader = PdfReader(io.BytesIO(raw))
            return "\n".join((page.extract_text() or "") for page in reader.pages)
        except Exception as exc:  # pragma: no cover - defensive, surfaced in the record itself
            return f"__EXTRACTION_FAILED__: {exc}"
    # crude HTML text extraction — good enough for change detection, not for parsing rules
    text = raw.decode("utf-8", errors="replace")
    text = re.sub(r"<script.*?</script>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<style.*?</style>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def content_hash(text: str) -> str:
    normalized = re.sub(r"\s+", " ", text).strip()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def load_json(path: Path, default):
    if not path.exists():
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def build_watchlist(watch_all_states: bool):
    sources_cfg = load_json(SOURCES_FILE, {"sources": []})
    watchlist = list(sources_cfg.get("sources", []))

    if watch_all_states:
        profiles = load_json(STATE_PROFILES_FILE, {"states": []})
        for state in profiles.get("states", []):
            url = state.get("official_website")
            if not url:
                continue
            watchlist.append(
                {
                    "id": f"state-website-{state['state_code']}",
                    "tax_type": "STATE_LEVY",
                    "jurisdiction": f"NG-STATE:{state['state_code']}",
                    "url": url,
                    "kind": "html",
                    "linked_rule_ids": [],
                    "note": f"Superficial tripwire for {state['state_name']} ({state.get('verification_status')}) — a hash change means 're-research this state', not 'a known rule changed'.",
                }
            )
    return watchlist


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--watch-all-states", action="store_true", help="also poll every state's official_website from state_profiles.json")
    parser.add_argument("--dry-run", action="store_true", help="fetch and hash, but write nothing to disk")
    args = parser.parse_args()

    watchlist = build_watchlist(args.watch_all_states)
    if not watchlist:
        print(f"No sources configured in {SOURCES_FILE}", file=sys.stderr)
        return 1

    previous_hashes = load_json(HASHES_FILE, {})
    new_hashes = dict(previous_hashes)
    changes_detected = 0
    errors = 0

    for source in watchlist:
        source_id = source["id"]
        url = source["url"]
        try:
            raw = fetch_bytes(url)
            text = extract_text(url, raw, source.get("kind", "html"))
            new_hash = content_hash(text)
        except Exception as exc:
            print(f"[ERROR] {source_id} ({url}): {exc}")
            errors += 1
            continue

        if source.get("kind") != "pdf" and len(text) < 500:
            print(f"[WARN]     {source_id}: only {len(text)} chars extracted — likely a JS-rendered shell, not real content (see known_limitation)")

        old_hash = previous_hashes.get(source_id)
        if old_hash is None:
            print(f"[NEW]      {source_id}: first time seen, baseline hash recorded")
        elif old_hash != new_hash:
            changes_detected += 1
            print(f"[CHANGED]  {source_id}: content hash changed since last poll")
            if not args.dry_run:
                record = {
                    "detected_at": datetime.now(timezone.utc).isoformat(),
                    "detected_by": "python-monitor:monitor.py",
                    "source_id": source_id,
                    "source_url": url,
                    "tax_type": source.get("tax_type"),
                    "jurisdiction": source.get("jurisdiction"),
                    "linked_rule_ids": source.get("linked_rule_ids", []),
                    "previous_hash": old_hash,
                    "new_hash": new_hash,
                    "content_snippet": text[:2000],
                    "review_status": "PENDING",
                    "reviewed_by": None,
                    "reviewed_at": None,
                    "review_notes": None,
                }
                ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
                save_json(CHANGE_LOG_DIR / f"{ts}_{source_id}.json", record)
        else:
            print(f"[UNCHANGED] {source_id}")

        new_hashes[source_id] = new_hash

    if not args.dry_run:
        save_json(HASHES_FILE, new_hashes)

    print(f"\nPoll complete: {len(watchlist)} source(s), {changes_detected} change(s) detected, {errors} error(s).")
    if changes_detected > 0:
        print(f"Review pending change records in: {CHANGE_LOG_DIR}")
        print("Reminder: detection never auto-applies a rule change. A tax professional must review, validate, and approve before any new TaxRuleVersion is created (brief §21/§39/§42).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
