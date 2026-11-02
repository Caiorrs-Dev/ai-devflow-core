# Runbook: <service or symptom>

What this runbook covers, in one line: the symptom an on-call person would
search for.

## Symptoms

<!-- What the responder sees: the alert name, the error text, the user report. -->

- Symptom: <alert or error> → go to <step>.

## Procedure

<!-- Numbered steps, each runnable as written: exact commands, dashboards, queries. No "investigate". -->

1. Confirm the symptom: <command or dashboard URL>.
2. Mitigate: <exact command or toggle>.
3. Verify the mitigation worked: <command or metric>.
4. Escalate when: <condition> — contact <where>.

## After the incident

- File or update the postmortem: `docs/postmortems/`.
- Update this runbook with what you learned that the steps above got wrong.
