export interface Currency {
  code: string;
  cc: string;
  name: string;
  symbol: string;
}

export const CURRENCIES: Currency[] = [
  { code: "INR", cc: "IN", name: "Indian Rupee", symbol: "₹" },
  { code: "USD", cc: "US", name: "US Dollar", symbol: "$" },
  { code: "EUR", cc: "EU", name: "Euro", symbol: "€" },
  { code: "GBP", cc: "GB", name: "British Pound", symbol: "£" },
  { code: "AED", cc: "AE", name: "UAE Dirham", symbol: "د.إ" },
  { code: "SAR", cc: "SA", name: "Saudi Riyal", symbol: "﷼" },
  { code: "QAR", cc: "QA", name: "Qatari Riyal", symbol: "﷼" },
  { code: "KWD", cc: "KW", name: "Kuwaiti Dinar", symbol: "د.ك" },
  { code: "BHD", cc: "BH", name: "Bahraini Dinar", symbol: ".د.ب" },
  { code: "OMR", cc: "OM", name: "Omani Rial", symbol: "﷼" },
  { code: "AUD", cc: "AU", name: "Australian Dollar", symbol: "A$" },
  { code: "NZD", cc: "NZ", name: "New Zealand Dollar", symbol: "NZ$" },
  { code: "CAD", cc: "CA", name: "Canadian Dollar", symbol: "C$" },
  { code: "SGD", cc: "SG", name: "Singapore Dollar", symbol: "S$" },
  { code: "HKD", cc: "HK", name: "Hong Kong Dollar", symbol: "HK$" },
  { code: "MYR", cc: "MY", name: "Malaysian Ringgit", symbol: "RM" },
  { code: "THB", cc: "TH", name: "Thai Baht", symbol: "฿" },
  { code: "IDR", cc: "ID", name: "Indonesian Rupiah", symbol: "Rp" },
  { code: "PHP", cc: "PH", name: "Philippine Peso", symbol: "₱" },
  { code: "VND", cc: "VN", name: "Vietnamese Dong", symbol: "₫" },
  { code: "CNY", cc: "CN", name: "Chinese Yuan", symbol: "¥" },
  { code: "JPY", cc: "JP", name: "Japanese Yen", symbol: "¥" },
  { code: "KRW", cc: "KR", name: "South Korean Won", symbol: "₩" },
  { code: "CHF", cc: "CH", name: "Swiss Franc", symbol: "Fr" },
  { code: "SEK", cc: "SE", name: "Swedish Krona", symbol: "kr" },
  { code: "NOK", cc: "NO", name: "Norwegian Krone", symbol: "kr" },
  { code: "DKK", cc: "DK", name: "Danish Krone", symbol: "kr" },
  { code: "PLN", cc: "PL", name: "Polish Zloty", symbol: "zł" },
  { code: "CZK", cc: "CZ", name: "Czech Koruna", symbol: "Kč" },
  { code: "TRY", cc: "TR", name: "Turkish Lira", symbol: "₺" },
  { code: "ILS", cc: "IL", name: "Israeli Shekel", symbol: "₪" },
  { code: "ZAR", cc: "ZA", name: "South African Rand", symbol: "R" },
  { code: "EGP", cc: "EG", name: "Egyptian Pound", symbol: "E£" },
  { code: "NGN", cc: "NG", name: "Nigerian Naira", symbol: "₦" },
  { code: "KES", cc: "KE", name: "Kenyan Shilling", symbol: "KSh" },
  { code: "BRL", cc: "BR", name: "Brazilian Real", symbol: "R$" },
  { code: "MXN", cc: "MX", name: "Mexican Peso", symbol: "MX$" },
  { code: "LKR", cc: "LK", name: "Sri Lankan Rupee", symbol: "Rs" },
  { code: "NPR", cc: "NP", name: "Nepalese Rupee", symbol: "Rs" },
  { code: "BDT", cc: "BD", name: "Bangladeshi Taka", symbol: "৳" },
  { code: "PKR", cc: "PK", name: "Pakistani Rupee", symbol: "Rs" },
];

export function currencyByCode(code: string): Currency {
  return (
    CURRENCIES.find((c) => c.code === code) ?? {
      code,
      cc: code.slice(0, 2).toUpperCase(),
      name: code,
      symbol: code.slice(0, 1).toUpperCase(),
    }
  );
}
