-- Manual Mobile Money (interim, until the MTN/Orange APIs are integrated): editable settings.
-- Existing rows are kept so values changed by an administrator survive re-runs.
INSERT INTO "SystemSetting" ("key", "valueType", "value", "descriptionEn", "descriptionFr", "category", "isPublic", "updatedAt")
VALUES
  ('payment.manual_mobile_money_enabled', 'BOOLEAN', 'true', 'While the MTN/Orange API is not configured, customers send Mobile Money by hand to the numbers below and enter the transaction ID', 'Tant que l''API MTN/Orange n''est pas configurée, les clients envoient le Mobile Money à la main aux numéros ci-dessous et saisissent l''ID de transaction', 'payment', false, CURRENT_TIMESTAMP),
  ('payment.manual_mtn_momo_number', 'STRING', '+237677550803', 'MTN Mobile Money number customers send payments to', 'Numéro MTN Mobile Money auquel les clients envoient leurs paiements', 'payment', true, CURRENT_TIMESTAMP),
  ('payment.manual_orange_money_number', 'STRING', '+237699949027', 'Orange Money number customers send payments to', 'Numéro Orange Money auquel les clients envoient leurs paiements', 'payment', true, CURRENT_TIMESTAMP),
  ('payment.manual_mobile_money_account_name', 'STRING', 'WOUAPIT MBAIMOUN NJI ROLAND', 'Account holder name shown with both Mobile Money numbers', 'Nom du titulaire affiché avec les deux numéros Mobile Money', 'payment', true, CURRENT_TIMESTAMP),
  ('payment.manual_whatsapp_number', 'STRING', '+258878275656', 'WhatsApp number customers send their transaction ID to', 'Numéro WhatsApp auquel les clients envoient leur ID de transaction', 'payment', true, CURRENT_TIMESTAMP),
  ('payment.manual_mobile_money_expiry_hours', 'INTEGER', '24', 'Hours a hand-made Mobile Money transfer may stay unconfirmed before the booking expires', 'Heures pendant lesquelles un transfert Mobile Money manuel peut rester non confirmé avant expiration', 'payment', false, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
