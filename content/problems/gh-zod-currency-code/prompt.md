# Currency code string format

Zod ships string formats such as `z.email()`, `z.hostname()`, `z.hex()` and
`z.creditCard()`. Users keep asking for an ISO 4217 currency code format. Today they
write `z.string().length(3)`, which accepts `"ZZZ"` and `"usd"`.

## The ask

Add `z.currencyCode()`, a string format that accepts only **active** ISO 4217
alphabetic codes.

- Available from both `zod` (Classic) and `zod/mini`, and it takes the same optional
  params (`string | { message, error, ... }`) as the other string formats.
- The format id is `currency_code`.
- The pattern is exposed as `z.regexes.currencyCode`, like the other built-in patterns.
- Matching is exact and case-sensitive: three uppercase letters from the list, nothing else.

## The code list

Finance pulled this from the current SIX Group "list one" (178 codes). Use **exactly**
this list. It differs from older copies of the standard. For example, `ANG` and `BGN`
were withdrawn, and `XCG` and `XAD` were added.

```
AED AFN ALL AMD AOA ARS AUD AWG AZN BAM BBD BDT BHD BIF BMD BND BOB BOV BRL BSD BTN BWP BYN BZD CAD
CDF CHE CHF CHW CLF CLP CNY COP COU CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL
GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW
KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV MYR MZN NAD
NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP
SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD USN UYI UYU UYW UZS
VED VES VND VUV WST XAD XAF XAG XAU XBA XBB XBC XBD XCD XCG XDR XOF XPD XPF XPT XSU XTS XUA XXX YER
ZAR ZMW ZWG
```

## Acceptance criteria

- `z.currencyCode().parse("USD")` returns `"USD"`. `"XXX"`, `"XCG"` and `"XAD"` pass too.
- `""`, `"usd"`, `"US"`, `"USDX"`, `" USD"`, `"ANG"` and `"BGN"` fail.
- A failure is one issue: `code: "invalid_format"`, `format: "currency_code"`, and the
  English message `"Invalid currency code"`.
- `z.toJSONSchema(z.currencyCode())` emits `type: "string"`, `format: "currency_code"`,
  and the pattern's source.
- The Mini API works the same way: `z.parse(z.currencyCode(), "EUR")`.

## Non-goals

Numeric codes, currency names, and automated list refreshes. Translations for
non-English locales are nice to have, not required.
