export interface ScriptLine {
  speaker: string;
  text: string;
  pauseMs?: number;
}

/**
 * A scripted Sprint 12 standup for demo mode and integration tests. It contains
 * real decisions, owners and dates so the follow-up has something to find, and
 * two spoken questions to Zeno so voice mode can be shown without a live call.
 */
export const DEMO_SCRIPT: ScriptLine[] = [
  { speaker: "Priya Raman", text: "Alright, Sprint 12 standup. We have eight days until the Atlas launch on the thirtieth, so let's keep this to blockers only." },
  { speaker: "Marcus Lee", text: "Billing first. The dual write to the new pricing engine is running in staging and reconciliation found three mismatches, all rounding on annual plans." },
  { speaker: "Marcus Lee", text: "I'll have the rounding fix in by Wednesday. After that ATL-101 is ready for review." },
  { speaker: "Sofia Alvarez", text: "That is the one I am most worried about. If billing is not done we cannot launch." },
  { speaker: "Dana Whitfield", text: "The SSO login loop is still blocked. Okta has not come back on ticket four four seven one, and I cannot reproduce it without their assertion format." },
  { speaker: "Priya Raman", text: "Zeno, what's blocking the launch?", pauseMs: 1500 },
  { speaker: "Priya Raman", text: "Dana, escalate the Okta ticket to their support manager today, and if we do not hear back by Thursday we ship with the workaround and document it." },
  { speaker: "Dana Whitfield", text: "Understood. I'll escalate this afternoon." },
  { speaker: "Tom Becker", text: "Load testing has not started. I need a clean staging window where billing is not dual writing, otherwise the numbers are meaningless." },
  { speaker: "Marcus Lee", text: "I can pause the dual write on Thursday morning for two hours." },
  { speaker: "Tom Becker", text: "That works. I'll run the five times load test Thursday morning and have results by end of day." },
  { speaker: "Priya Raman", text: "Decision then: Thursday morning is the load test window and billing pauses dual write for it." },
  { speaker: "Sofia Alvarez", text: "The API reference is done and in review. I just need a final pass on the auth guide, maybe an hour of work." },
  { speaker: "Priya Raman", text: "Then let's close it out today so it is off the board." },
  { speaker: "Sofia Alvarez", text: "Zeno, move ATL-103 to Done.", pauseMs: 1500 },
  { speaker: "Sofia Alvarez", text: "Zeno, confirm.", pauseMs: 2000 },
  { speaker: "Dana Whitfield", text: "Onboarding is four steps out of five. The billing contact step depends on Marcus landing ATL-101, so it slips until that is in." },
  { speaker: "Priya Raman", text: "Fine. Anything else? The runbook still needs the rollback thresholds named properly, Tom." },
  { speaker: "Tom Becker", text: "I'll write the exact metric thresholds into ATL-108 by Friday." },
  { speaker: "Sofia Alvarez", text: "One open question: do we announce the launch on the thirtieth or wait until we have run a week in production? We did not settle that." },
  { speaker: "Priya Raman", text: "Let's park that for the leadership sync on Thursday. That's it, thanks everyone." },
];
