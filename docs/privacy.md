# Personal-data profile: sources and decisions

`src/lib/client/privacy.ts` chooses a profile for each client according to their market. This file records where those
values come from and why they were chosen. If a value changes, update this file first, then the code and tests.

| Data | Period | Basis |
| --- | --- | --- |
| Contact form messages | 12 months, then automatic deletion | No fixed period in law; storage limited to the purpose (KVKK art. 4, GDPR art. 5(1)(e)). 12 months is a reasonable upper limit for following up an answered request. |
| Booking records | 12 months | Same principle |
| Order records (TR) | 3 years | Distance Contracts Regulation art. 20. Commercial books and documents (Turkish Commercial Code art. 82: 10 years) are kept in the accounting system, not on the site. |
| Order records (UK) | 6 years | HMRC: 6 years for a limited company, 5 years for a sole trader; the higher value was chosen |
| Order records (IE / NL / DE) | 6 / 7 / 8 years | National accounting retention periods; Germany has had 8 years since 2025 |
| Rate-limit records | 1 day | Only to prevent abuse; the IP address is not kept in the clear (a site-specific keyed digest) |

| Rule | Value | Basis |
| --- | --- | --- |
| Periodic deletion | Every night | KVKK Deletion Regulation art. 11: at most every 6 months |
| Response to a person's request | 30 days | KVKK art. 13 and Regulation art. 12; GDPR art. 12(3) (one month) |
| Data region | UK and EU clients: EU | GDPR chapter V; the EU has an adequacy decision for the UK. In Cloudflare D1 and R2 the region can only be chosen at creation. |
| VERBIS | Most small businesses are exempt | Board decision (Official Gazette, 1 October 2025): fewer than 50 employees a year and a balance sheet under TRY 100 million. The obligation rests with the business. |

## Open questions (to ask a lawyer)

- **KVKK cross-border transfer (art. 9):** Cloudflare and form services store data outside Türkiye. The disclosure text
  says so; the safeguard required for the transfer (standard contract etc.) is between the business and the hosting
  provider.
- The template texts (`rules/privacy.md`) should be checked once before sale.

## Sources

- Regulation on the Deletion, Destruction or Anonymisation of Personal Data (art. 11, art. 12)
- Distance Contracts Regulation (art. 20); Turkish Commercial Code art. 82
- KVKK Board decision, VERBIS exemption (Official Gazette, 1 October 2025, issue 33034)
- HMRC record-keeping periods; Germany's Fourth Bureaucracy Reduction Act (accounting documents: 8 years)
- Cloudflare D1 data location: https://developers.cloudflare.com/d1/configuration/data-location/
- Cloudflare R2 data location: https://developers.cloudflare.com/r2/reference/data-location/
