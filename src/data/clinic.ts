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

  // Latitude/longitude of the clinic entrance, decoded from the Google Plus
  // Code below. Feeds the GeoCoordinates block in the schema, which is what
  // the local map pack reads.
  geo: { lat: 30.329812, lng: 78.072937 },
  plusCode: '83HF+W5 Dehradun, Uttarakhand',

  // Deliberately empty. A Google Maps iframe loads third-party scripts and sets
  // cookies, which would make the privacy notice's "no tracking cookies, no
  // third-party analytics" statement untrue. The contact page links out to
  // directions instead — same destination for the patient, nothing loaded here.
  mapEmbedUrl: '',

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
      qualifications: 'BDS, MDS (Conservative Dentistry & Endodontics)',
      role: 'Principal Dentist',
      // Registration number deliberately not published — see showRegistration below.
      registration: '',
      bio: [
        'Dr. Advaitha Anand graduated with a Bachelor of Dental Surgery (BDS) from Karnataka in 2011, and went on to complete a Master of Dental Surgery (MDS) in Conservative Dentistry and Endodontics in 2023.',
        'Conservative dentistry and endodontics is the branch concerned with saving teeth rather than replacing them — diagnosing what has gone wrong inside a tooth, treating decay and infection at the root, and restoring what remains so the natural tooth can stay in place and keep working. Root canal treatment sits at the centre of it, along with the restorative work that follows.',
        'With over fifteen years of clinical experience, Dr. Anand practises with a preference for conserving natural tooth structure wherever it is sound enough to keep. Extraction is considered when a tooth genuinely cannot be saved, not as a shortcut, and the reasoning behind either recommendation is set out before treatment begins.',
        'Her approach is evidence-based: treatment decisions follow what the clinical research supports, and patients are told what the options are, what each involves, and what the trade-offs are — so the decision is an informed one.',
      ],
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
  // Two separate Web3Forms keys, deliberately. The registration form carries
  // medical histories; the enquiry form carries "what are your opening hours".
  // Separate keys mean each has its own monthly allowance, they arrive clearly
  // apart, and the registration key can be revoked on its own without taking
  // appointment enquiries down with it.
  web3formsKey: 'PLACEHOLDER',        // TODO: enquiry form — key from web3forms.com
  web3formsRegistrationKey: '22aa323f-d3b3-43af-a2df-bfbcef947181',

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
