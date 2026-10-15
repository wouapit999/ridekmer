# Legal and operational review checklist (Cameroon)

> RideKmer's documentation and code do **not** constitute legal advice. Each item below must be
> validated by qualified Cameroonian professionals (lawyer, accountant, insurance broker)
> before production launch. Status: ☐ open · ☑ validated (add date and reviewer).

| #   | Item                                                                 | Why it matters                                                               | Where in the product                               | Status |
| --- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------- | ------ |
| 1   | Car-rental authorisation / licensing requirements                    | operating legally as a rental company and marketplace                        | company setup                                      | ☐      |
| 2   | Customer rental agreement                                            | enforceable terms, liability, deposit, fuel, km, late return                 | contract template `CUSTOMER_RENTAL_AGREEMENT`      | ☐      |
| 3   | Vehicle-owner management agreement                                   | commission, maintenance approval, payouts, withdrawal, insurance obligations | `OWNER_MANAGEMENT_AGREEMENT`                       | ☐      |
| 4   | Insurance coverage for rental use (self-drive and chauffeur)         | mandatory cover, claims process, excess                                      | document type `motor_insurance_certificate`        | ☐      |
| 5   | Commercial use of privately owned vehicles                           | legality of marketplace model                                                | ownership models                                   | ☐      |
| 6   | Electronic-signature requirements                                    | validity of click-to-accept evidence; need for certified provider            | `SignatureEvidence`                                | ☐      |
| 7   | Consumer-protection obligations                                      | pre-contract information, pricing display, withdrawal rights                 | public pages, checkout                             | ☐      |
| 8   | Customer identity-document processing                                | lawful basis, retention, security                                            | `VerificationDocument`, privacy notice             | ☐      |
| 9   | Driving-licence verification                                         | minimum seniority, foreign licences                                          | eligibility rules                                  | ☐      |
| 10  | GPS disclosure and consent                                           | transparency to customers, owner consent for installation                    | rental agreement, privacy notice, consent document | ☐      |
| 11  | Personal-data protection compliance (Law 2024/017 and related texts) | registration/notification duties, DPO, rights handling                       | `docs/PRIVACY.md`, `DataRequest`                   | ☐      |
| 12  | Location-data retention                                              | lawful retention period                                                      | `tracking.location_retention_days`                 | ☐      |
| 13  | Accident and liability procedures                                    | police report, insurer notification, responsibility                          | incidents module                                   | ☐      |
| 14  | Security-deposit handling                                            | holding, refund timing, deductions, disputes                                 | payments, ledger                                   | ☐      |
| 15  | Refund terms                                                         | timing, method, fees                                                         | cancellation policy                                | ☐      |
| 16  | Cancellation terms                                                   | free window, late fees, no-show                                              | `cancellation.*` settings                          | ☐      |
| 17  | Owner income and tax treatment                                       | withholding, statements                                                      | ledger, owner statements                           | ☐      |
| 18  | RideKmer invoicing and tax treatment (VAT)                           | invoice content, numbering, tax rate                                         | `pricing.tax_bps`, invoices (M6)                   | ☐      |
| 19  | Mobile Money production approval                                     | merchant contracts with MTN and Orange                                       | payments                                           | ☐      |
| 20  | Chauffeur employment / contractor status                             | labour law, assignment agreements                                            | `CHAUFFEUR_ASSIGNMENT`                             | ☐      |
| 21  | Software licence decision                                            | `LICENSE` placeholder                                                        | repository                                         | ☐      |

The public site shows a visible "placeholder pending legal review" notice on legal pages
until items 2, 7, 8, 10, 15 and 16 are validated.
