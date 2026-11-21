// The only file that reads the phone's contacts or sends a text. The system contact picker is opened only from a
// button the person tapped (rule 6). A contact's name and number live in memory until the message is sent; they are
// never stored, uploaded or logged (rule 8).
import { Contact } from 'expo-contacts';
import * as SMS from 'expo-sms';

export type Person = { key: string; name: string; number: string };
export type Picked =
  | { kind: 'person'; person: Person }
  | { kind: 'no-number'; name: string }
  | { kind: 'cancelled' }
  | { kind: 'denied' };

/** One contact from the iPhone's own picker. A contact with no phone number cannot be texted, so it is reported by name only. */
export async function pickContact(): Promise<Picked> {
  let contact: Contact | null;
  try { contact = await Contact.presentPicker(); }
  catch { return { kind: 'denied' }; } // contacts are off for Sidequest in iPhone Settings
  if (!contact) return { kind: 'cancelled' };
  const [name, phones] = await Promise.all([contact.getFullName().catch(() => ''), contact.getPhones().catch(() => [])]);
  const label = name.trim() || 'This contact';
  const number = phones.find(p => p.number?.trim())?.number?.trim();
  if (!number) return { kind: 'no-number', name: label };
  return { kind: 'person', person: { key: `${label}|${number}`, name: label, number } };
}

export const canSendText = () => SMS.isAvailableAsync().catch(() => false);

/** Opens Messages with the people and the text filled in; the person sends it themselves. */
export async function sendText(numbers: string[], message: string): Promise<'sent' | 'cancelled' | 'unknown'> {
  return (await SMS.sendSMSAsync(numbers, message)).result;
}
