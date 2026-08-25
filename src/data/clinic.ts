/**
 * Single source of truth for clinic details.
 *
 * Everything that shows a name, address, phone or hours reads from here —
 * pages, footer, and the LocalBusiness/Dentist structured data.
 * Keeping it in one place is what keeps NAP (name/address/phone) consistent,
 * which is one of the biggest local-SEO signals.
 */

export const clinic = {
  name: 'Sri Shankara Dental Clinic',
  shortName: 'Sri Shankara Dental',
  tagline: 'Gentle, evidence-based dental care in Tapovan Enclave, Dehradun',

  // --- Contact -------------------------------------------------------------
  phone: '+91 89792 41142',
  phoneHref: 'tel:+918979241142',
  landline: '+91 135 3549458',
  landlineHref: 'tel:+911353549458',
  whatsapp: '',                       // TODO: optional, digits only e.g. '918979241142'
  email: 'hello@srishankaradental.com',

  // --- Address (must match Google Business Profile character for character) --
  address: {
    street: 'Nalapani Road (Opp 8th Cross)',
    locality: 'Tapovan Enclave',
    region: 'Uttarakhand',
    city: 'Dehradun',
    postalCode: '248008',
    country: 'IN',
  },

  // Latitude/longitude of the clinic entrance. Pull from Google Maps.
  geo: { lat: 0, lng: 0 },            // TODO

  // Paste the Google Maps "share > embed" URL here.
  mapEmbedUrl: '',                    // TODO

  // --- Opening hours -------------------------------------------------------
  // Each day has zero or more sessions. The clinic closes for the middle of
  // the day, so most weekdays have two.
  hours: [
    { day: 'Monday',    sessions: [['09:30', '12:30'], ['16:00', '19:00']] },
    { day: 'Tuesday',   sessions: [['09:30', '12:30'], ['16:00', '19:00']] },
    { day: 'Wednesday', sessions: [['09:30', '12:30'], ['16:00', '19:00']] },
    { day: 'Thursday',  sessions: [['09:30', '12:30'], ['16:00', '19:00']] },
    { day: 'Friday',    sessions: [['09:30', '12:30'], ['16:00', '19:00']] },
    { day: 'Saturday',  sessions: [['09:30', '12:30']] },
    { day: 'Sunday',    sessions: [] },
  ],

  // --- Practitioners -------------------------------------------------------
  dentists: [
    {
      name: 'Dr. Advaitha Anand',
      qualifications: 'MDS',
      role: 'Principal Dentist',
      // Registration number deliberately not published — see showRegistration below.
      registration: '',
      bio: '',                        // TODO: paste Dr. Anand's biography here
      slug: 'dr-advaitha-anand',
    },
  ],

  /** Set true to display Dental Council registration numbers on the About page. */
  showRegistration: false,

  // --- Third-party profiles ------------------------------------------------
  profiles: {
    googleBusiness: '',               // TODO
    practo: '',                       // TODO
    justdial: '',                     // TODO
  },

  // --- Integrations --------------------------------------------------------
  web3formsKey: 'PLACEHOLDER',        // TODO: free access key from web3forms.com

  // --- Compliance ----------------------------------------------------------
  grievanceOfficer: {
    name: 'PLACEHOLDER',              // required under the DPDP Rules 2025
    email: 'privacy@srishankaradental.com',
  },
} as const;

/** "9:30am–12:30pm, 4:00–7:00pm" — or "Closed". */
export function formatSessions(sessions: readonly (readonly [string, string])[]): string {
  if (!sessions.length) return 'Closed';
  return sessions.map(([a, b]) => `${t(a)}\u2013${t(b)}`).join(', ');
}

/** 24h "16:00" -> "4:00pm" */
function t(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')}${suffix}`;
}

export function formattedAddress(): string {
  const a = clinic.address;
  return `${a.street}, ${a.locality}, ${a.city}, ${a.region} ${a.postalCode}`;
}
