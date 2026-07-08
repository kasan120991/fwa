// Phone helpers. Numbers are stored as raw digits (leads/clients normalize with
// `.replace(/\D/g, '')` on write), while Vapi delivers E.164 (e.g. +15551234567).
// Matching on the trailing 10 digits reconciles the two formats for US numbers.

/** Strip everything but digits: "+1 (555) 123-4567" -> "15551234567". */
export function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '')
}

/** Last 10 digits, so +15551234567 / 15551234567 / 5551234567 all compare equal. */
export function last10(value) {
  return onlyDigits(value).slice(-10)
}
