/**
 * WhatsApp click-to-chat link (https://wa.me) with a prefilled message. It opens WhatsApp on
 * the customer's phone or WhatsApp Web; the customer only has to press send.
 */
export function whatsappChatLink(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}
