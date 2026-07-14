// Self-tests for shared portal / onboarding form validators.

import {
  abnChecksumOk,
  luhnOk,
  validateCardExpiry,
  validateCardNumber,
  validateDemoCardFields,
  validateOnboardingDetailsFields,
  validateOptionalPhone,
  validateRequiredAbn,
  validateRequiredEmail,
} from "@/lib/form-validation";

export function checkFormValidationBasics(): { ok: boolean; detail: string } {
  const stripeOk = luhnOk("4242424242424242");
  const badLen = validateCardNumber("4242424242444444"); // 16 digits but fails Luhn
  const goodPan = validateCardNumber("4242 4242 4242 4242");
  const abnOk = !validateRequiredAbn("51 824 753 556");
  const abnChecksum = abnChecksumOk("51824753556");
  const emailOk = !validateRequiredEmail("owner@example.com");
  const emailBad = !!validateRequiredEmail("not-an-email");
  const phoneOk = !validateOptionalPhone("0400 111 222");
  const phoneBad = !!validateOptionalPhone("123");
  const expOk = !validateCardExpiry("02/28", new Date("2026-07-14"));
  const expBad = !!validateCardExpiry("01/20", new Date("2026-07-14"));

  const card = validateDemoCardFields({
    cardName: "Sa",
    cardNumber: "4242424242444444",
    cardExpiry: "0228",
    cardCvc: "12",
  });
  const cardBlocks =
    !card.ok &&
    !!card.errors.cardNumber &&
    !!card.errors.cardCvc;

  const details = validateOnboardingDetailsFields({
    abn: "12345",
    contactName: "Sam",
    contactEmail: "bad",
    contactPhone: "",
    industry: "restaurant_cafe",
    natureOfBusiness: "cafe",
  });
  const detailsBlocks =
    !details.ok && !!details.errors.abn && !!details.errors.contactEmail;

  const ok =
    stripeOk &&
    !!badLen &&
    !goodPan &&
    abnOk &&
    abnChecksum &&
    emailOk &&
    emailBad &&
    phoneOk &&
    phoneBad &&
    expOk &&
    expBad &&
    cardBlocks &&
    detailsBlocks;

  return {
    ok,
    detail: `stripe=${stripeOk} badPan=${!!badLen} abn=${abnOk} cardBlocks=${cardBlocks} detailsBlocks=${detailsBlocks}`,
  };
}
