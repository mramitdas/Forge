export interface CountryEntry {
  dial: string;
  iso: string;
  name: string;
}

export const COUNTRY_CODES: CountryEntry[] = [
  { dial: "+91", iso: "IN", name: "India" },
  { dial: "+1", iso: "US", name: "United States" },
  { dial: "+44", iso: "GB", name: "United Kingdom" },
  { dial: "+971", iso: "AE", name: "United Arab Emirates" },
  { dial: "+974", iso: "QA", name: "Qatar" },
  { dial: "+973", iso: "BH", name: "Bahrain" },
  { dial: "+968", iso: "OM", name: "Oman" },
  { dial: "+965", iso: "KW", name: "Kuwait" },
  { dial: "+966", iso: "SA", name: "Saudi Arabia" },
  { dial: "+61", iso: "AU", name: "Australia" },
  { dial: "+65", iso: "SG", name: "Singapore" },
  { dial: "+60", iso: "MY", name: "Malaysia" },
  { dial: "+62", iso: "ID", name: "Indonesia" },
  { dial: "+63", iso: "PH", name: "Philippines" },
  { dial: "+66", iso: "TH", name: "Thailand" },
  { dial: "+84", iso: "VN", name: "Vietnam" },
  { dial: "+81", iso: "JP", name: "Japan" },
  { dial: "+82", iso: "KR", name: "South Korea" },
  { dial: "+86", iso: "CN", name: "China" },
  { dial: "+49", iso: "DE", name: "Germany" },
  { dial: "+33", iso: "FR", name: "France" },
  { dial: "+39", iso: "IT", name: "Italy" },
  { dial: "+34", iso: "ES", name: "Spain" },
  { dial: "+31", iso: "NL", name: "Netherlands" },
  { dial: "+46", iso: "SE", name: "Sweden" },
  { dial: "+7", iso: "RU", name: "Russia" },
  { dial: "+27", iso: "ZA", name: "South Africa" },
  { dial: "+234", iso: "NG", name: "Nigeria" },
  { dial: "+55", iso: "BR", name: "Brazil" },
  { dial: "+52", iso: "MX", name: "Mexico" },
  { dial: "+92", iso: "PK", name: "Pakistan" },
  { dial: "+880", iso: "BD", name: "Bangladesh" },
  { dial: "+94", iso: "LK", name: "Sri Lanka" },
  { dial: "+977", iso: "NP", name: "Nepal" },
];

export function dialFor(code: string | null | undefined): string {
  if (!code) return "";
  return COUNTRY_CODES.find((c) => c.dial === code)?.dial ?? code;
}
