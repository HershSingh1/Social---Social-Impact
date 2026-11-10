// Pure helpers (no Supabase import) so they can be used and tested without native modules.

export function otpErrorMessage(e: unknown): string {
  const code = (e as { code?: string } | null)?.code;
  if (code === 'otp_expired' || code === 'otp_invalid' || code === 'validation_failed') {
    return 'That code is wrong or has expired. Check it or send a new one.';
  }
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') {
    return 'Too many tries, wait a minute.';
  }
  return 'We could not verify that code. Try again.';
}
