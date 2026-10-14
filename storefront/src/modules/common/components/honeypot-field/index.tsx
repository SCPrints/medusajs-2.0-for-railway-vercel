/**
 * Spam trap for public lead forms: an input real people never see, so only
 * form-filling bots put a value in it. The /api relays drop those submissions
 * silently (see lib/util/lead-relay.ts). Deliberately a nonsense name so
 * browser autofill never fills it for a genuine customer.
 */
export const HONEYPOT_FIELD = "scp_hp_x7"

export const HoneypotField = () => (
  <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
    <label>
      Leave this empty
      <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
    </label>
  </div>
)
