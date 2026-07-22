import type { ClientMenuCategoryId } from "@/lib/client-order-catalogue-data";

export type OrderDetailsHelpContent = {
  /** Checklist of what makes a brief usable */
  include: string[];
  /** Concrete sample briefs the client can mirror */
  examples: string[];
};

const BASE_INCLUDE = [
  "Who this is for (audience or segment)",
  "The offer, product, or topic — and any must-include facts",
  "Tone (e.g. warm, direct, premium) and words to avoid",
  "Desired outcome or CTA (book, enquire, visit, buy)",
  "Timing or go-live constraints if not in Preferred date",
];

const BY_CATEGORY: Partial<
  Record<ClientMenuCategoryId, { include?: string[]; examples: string[] }>
> = {
  social: {
    examples: [
      "Instagram carousel for our winter tasting menu (Fri–Sun only). Audience: local diners within 5 km. Highlight three dishes with prices, vegetarian options, and book-via-website CTA. Tone: warm and inviting — no hype words like 'best ever'. Go live next Thursday.",
      "LinkedIn post announcing our new B2B catering packages for offices in Parramatta. Mention minimum 20 guests, 48-hour notice, and link to the catering page. Tone: professional, not salesy.",
    ],
  },
  editorial: {
    examples: [
      "1,000-word blog: 'How to choose a family dentist in [suburb]'. Audience: parents of kids 5–12. Include three decision criteria, our after-hours hours, and a soft CTA to book a check-up. Avoid criticising competitors by name.",
    ],
  },
  website: {
    examples: [
      "Rewrite the About page. We are a family-run bakery (est. 2012) in Surry Hills. Must mention: sourdough baked daily, wholesale for cafés, and Saturday workshops. Keep under 250 words. Tone: plain and proud, not corporate.",
    ],
  },
  landing: {
    examples: [
      "Landing page for our free 30-minute strategy call. Audience: SME owners spending $2k+/mo on ads with weak ROI. Sections: problem, what we do, who it's for, FAQ, book-a-call CTA. No guarantees of results.",
    ],
  },
  email: {
    examples: [
      "Welcome email after someone joins our mailing list. Thank them, set expectation of one useful tip per fortnight, and invite them to reply with their biggest marketing headache. Subject under 8 words. Tone: friendly colleague.",
    ],
  },
  advertising: {
    examples: [
      "Google search ads for 'emergency plumber [suburb]'. Three headlines + two descriptions. USP: 60-minute arrival window, fixed call-out fee $89. Exclude DIY tips — we want booked jobs only.",
    ],
  },
  video: {
    examples: [
      "60-second Reel script: behind-the-scenes of Saturday brunch prep. Three beats: open with the dish, show the chef plating, end with 'Book Sunday brunch — link in bio'. Casual voice; no voiceover jargon.",
    ],
  },
  sales: {
    examples: [
      "One-page proposal leave-behind for a prospective corporate client (law firm, ~80 staff). Package: monthly content + LinkedIn. Price band $X–$Y. Emphasise compliance-safe drafting and one account manager.",
    ],
  },
  pr: {
    examples: [
      "Press release: we won [award] on [date]. Quote from founder (2 sentences). Boilerplate: who we are, where based, website. Send-ready for local business media — no sales language.",
    ],
  },
  reports: {
    examples: [
      "Client-facing monthly performance summary (1 page). Channels: Instagram + Google Business. Include: reach, enquiries, top post, and one recommendation. Numbers I'll paste in the next message.",
    ],
  },
  proof: {
    examples: [
      "Case study: Client X (café) — before/after for Instagram. Metrics: +40% weekend bookings in 8 weeks. Quote from owner approved. Structure: challenge, what we did, results, CTA to talk to us.",
    ],
  },
  education: {
    examples: [
      "Worksheet for a 45-minute workshop on writing better Google reviews replies. Audience: store managers. 1 page, fill-in boxes, 5 example replies (good vs weak).",
    ],
  },
  internal: {
    examples: [
      "Staff memo announcing new opening hours from 1 Aug. Channels: email + WhatsApp. Tone: clear and calm. Include who to ask with questions (Priya, front of house).",
    ],
  },
  hr: {
    examples: [
      "Job ad: part-time barista, weekends. Must-haves: latte art, RSA. Pay band and location. Benefits: staff meals, roster published 2 weeks ahead. Apply via email with CV.",
    ],
  },
  legal: {
    examples: [
      "Plain-English rewrite of our cancellation policy for the website. Keep the same rules; just make them readable for customers. Flag anything that needs lawyer review.",
    ],
  },
  events: {
    examples: [
      "Event page + invite email for our launch night on 12 Sep, 6–9pm. Capacity 80, free but RSVP required. Include dress code, parking, and accessibility notes.",
    ],
  },
  print: {
    examples: [
      "A5 flyer for letterbox drop in [postcodes]. Front: offer (20% off first visit this month). Back: map pin, hours, QR to book. Tone: neighbourhood, not discount-store shouty.",
    ],
  },
  support: {
    examples: [
      "FAQ: delivery & returns for our online shop. Cover cut-off times, metro vs regional, and how to start a return. Link to the returns form. Tone: helpful, not defensive.",
    ],
  },
  product: {
    examples: [
      "Release notes for app v2.4: new booking calendar, fix for iOS login. Audience: existing customers. Keep under 150 words. Soft CTA to update the app.",
    ],
  },
  messaging: {
    examples: [
      "Three SMS options (≤160 chars) reminding clients of tomorrow's appointment, with reschedule link. Tone: polite and brief. No emojis.",
    ],
  },
  discovery: {
    include: [
      ...BASE_INCLUDE,
      "Target questions or search phrases people ask (for AEO/GEO/LLMO)",
      "Locations, services, or products that must appear in answers",
    ],
    examples: [
      "AEO answer pack for: 'best Indian restaurant near [suburb] for a group booking'. Must include: private dining for 12, vegetarian + gluten-free options, book-online CTA. Avoid unverifiable 'best in Sydney' claims. Prefer extractable short answers AI can quote.",
      "Local SEO + GEO pack for our plumbing service area (postcodes 2xxx–2yyy). Priority pages: emergency, blocked drains, hot water. Include NAP consistency notes and 5 FAQ answers Google/AI might surface.",
    ],
  },
  brand_motion: {
    include: [
      "What the visual must communicate (offer, brand feeling, story)",
      "Style, colours, and anything that must appear on screen",
      "Format / aspect ratio and length",
      "Where it will run (ads, feed, site, packaging)",
    ],
    examples: [
      "Logo for a neighbourhood bakery — warm, handmade feel, works small on Google profile. Prefer wordmark + simple mark. Must work in one colour. Avoid trendy gradients.",
      "15s vertical short ad: winter tasting menu Fri–Sun. Hook with plated dish, end with book-online CTA. No stock footage look — use our brand colours.",
    ],
  },
};

export function getOrderDetailsHelp(
  categoryId: ClientMenuCategoryId,
  dishTitle: string,
): OrderDetailsHelpContent {
  const entry = BY_CATEGORY[categoryId];
  const examples = entry?.examples ?? [
    `We need this ${dishTitle.toLowerCase()} for [audience]. Topic/offer: [what]. Must include: [facts, prices, dates, location]. Tone: [e.g. warm / direct]. CTA: [book / enquire / visit]. Avoid: [claims or words]. Ready by: [date if known].`,
    "Rewrite our service page for first-time customers. Mention weekend availability, fixed call-out fee, and suburbs we cover. Tone: calm and trustworthy. End with book-online CTA. No guarantees of same-day attendance.",
  ];

  return {
    include: entry?.include ?? BASE_INCLUDE,
    examples,
  };
}
