// Ready-made promo / campaign catalog for client self-serve picks.
// Clients only set package price (budget), start date, and social channels.
// Each template has a fixed client price + markup; posts are pre-written.
// Never auto-publishes — spawns a draft campaign for the managed pipeline.

import { resolveBusinessType } from "@/lib/business-profiles";
import type {
  AgencyPromoTemplate,
  BusinessType,
  CampaignItem,
  Company,
  PromoIndustry,
  RequestType,
} from "@/lib/types";

/** Fallback when no template markup applies (~catalog average). */
export const DEFAULT_PROMO_MARKUP_PERCENT = 0.42;

export const PROMO_CHANNEL_OPTIONS: { id: string; label: string }[] = [
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "google_business", label: "Google Business" },
  { id: "tiktok", label: "TikTok" },
  { id: "email", label: "Email" },
];

export interface PromoTemplateOutline {
  dayOffset: number;
  channel: string;
  contentType: RequestType;
  title: string;
  /** Ready-to-publish caption body. */
  caption: string;
  hashtags: string;
  cta: string;
}

export interface PromoTemplate {
  id: string;
  industry: PromoIndustry;
  name: string;
  /** Short offer / promotion line shown to the client. */
  promotion: string;
  blurb: string;
  /** Suggested length in days (client can stretch via end date). */
  defaultDurationDays: number;
  /** Ongoing packages use a default window but are not strictly time-boxed. */
  ongoing?: boolean;
  /** Listed client package price (what they pay). */
  suggestedClientPriceUsd: number;
  /** Markup on delivery cost (0.49 = 49%). */
  markupPercent: number;
  /** @deprecated use suggestedClientPriceUsd — kept for callers expecting media budget. */
  suggestedBudgetUsd: number;
  defaultChannels: string[];
  availableChannels: string[];
  objective: string;
  keyMessage: string;
  outlines: PromoTemplateOutline[];
}

type PostSpec = {
  dayOffset: number;
  channel: string;
  title: string;
  caption: string;
  hashtags: string;
  cta: string;
};

function posts(items: PostSpec[]): PromoTemplateOutline[] {
  return items.map((p) => ({
    dayOffset: p.dayOffset,
    channel: p.channel,
    contentType: (p.channel === "email" ? "email_newsletter" : "social_post") as RequestType,
    title: p.title,
    caption: p.caption,
    hashtags: p.hashtags,
    cta: p.cta,
  }));
}

function tpl(
  partial: Omit<PromoTemplate, "suggestedBudgetUsd" | "blurb"> & { blurb?: string },
): PromoTemplate {
  const media = Math.round(
    (partial.suggestedClientPriceUsd / (1 + partial.markupPercent)) * 100,
  ) / 100;
  return {
    ...partial,
    blurb: partial.blurb ?? partial.promotion,
    suggestedBudgetUsd: media,
  };
}

const SOCIAL = ["facebook", "instagram", "google_business", "tiktok"] as const;
const SOCIAL_EMAIL = ["facebook", "instagram", "google_business", "tiktok", "email"] as const;

const CATALOG: PromoTemplate[] = [
  // ---- Restaurant / Café (6) ----
  tpl({
    id: "resto_slow_tuesday",
    industry: "restaurant_cafe",
    name: "Slow Tuesday Flash Sale",
    promotion: "20% off code (Tuesday20)",
    defaultDurationDays: 3,
    suggestedClientPriceUsd: 269,
    markupPercent: 0.49,
    defaultChannels: ["instagram", "facebook"],
    availableChannels: [...SOCIAL],
    objective: "Fill quiet Tuesdays with a flash discount code",
    keyMessage: "Use Tuesday20 for 20% off — this Tuesday only",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "instagram",
        title: "Teaser — Tuesday flash",
        caption:
          "Tuesdays just got interesting. A flash code is dropping tomorrow — set a reminder and come hungry.",
        hashtags: "#TuesdaySpecial #FlashSale #LocalEats",
        cta: "Turn on post notifications",
      },
      {
        dayOffset: 2,
        channel: "facebook",
        title: "Code live — Tuesday20",
        caption:
          "It’s live: code TUESDAY20 for 20% off. Valid today only — show the code when you order or book.",
        hashtags: "#Tuesday20 #RestaurantDeal",
        cta: "Book / order with Tuesday20",
      },
      {
        dayOffset: 3,
        channel: "instagram",
        title: "Last call",
        caption:
          "Last call for Tuesday20. 20% off ends tonight — don’t miss the midweek treat.",
        hashtags: "#LastChance #TuesdayDeal",
        cta: "Use Tuesday20 before midnight",
      },
    ]),
  }),
  tpl({
    id: "resto_new_menu",
    industry: "restaurant_cafe",
    name: "New Menu Launch",
    promotion: "Free dessert with main",
    defaultDurationDays: 14,
    suggestedClientPriceUsd: 649,
    markupPercent: 0.35,
    defaultChannels: ["instagram", "facebook", "google_business"],
    availableChannels: [...SOCIAL_EMAIL],
    objective: "Drive trial of the new menu with a free dessert incentive",
    keyMessage: "New menu — free dessert with every main",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "instagram",
        title: "Menu reveal",
        caption:
          "The new menu is here. Fresh plates, seasonal flavours — and free dessert with every main for a limited time.",
        hashtags: "#NewMenu #FreeDessert #Foodie",
        cta: "Reserve a table",
      },
      {
        dayOffset: 4,
        channel: "facebook",
        title: "Hero dish spotlight",
        caption:
          "Meet the dish everyone’s talking about. Order a main, get dessert on us — launch offer for two weeks only.",
        hashtags: "#ChefSpecial #NewMenuLaunch",
        cta: "See the full menu",
      },
      {
        dayOffset: 8,
        channel: "google_business",
        title: "In-venue offer",
        caption:
          "New menu + free dessert with mains. Ask your server about the launch offer this fortnight.",
        hashtags: "#LocalRestaurant",
        cta: "Directions & hours",
      },
      {
        dayOffset: 12,
        channel: "instagram",
        title: "Guest reaction",
        caption:
          "Sweet endings on us. Tag us when you try the new menu — free dessert still running this week.",
        hashtags: "#Foodstagram #DessertOnUs",
        cta: "Book before the offer ends",
      },
    ]),
  }),
  tpl({
    id: "resto_valentines",
    industry: "restaurant_cafe",
    name: "Valentine's Set Menu",
    promotion: "Pre-fixe menu booking",
    defaultDurationDays: 14,
    suggestedClientPriceUsd: 529,
    markupPercent: 0.39,
    defaultChannels: ["instagram", "facebook", "email"],
    availableChannels: [...SOCIAL_EMAIL],
    objective: "Sell out Valentine’s set-menu bookings",
    keyMessage: "Book our Valentine’s prix-fixe — seats limited",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "instagram",
        title: "Announce set menu",
        caption:
          "Valentine’s with us: a special prix-fixe menu made for two. Limited sittings — book early.",
        hashtags: "#ValentinesDinner #DateNight #PrixFixe",
        cta: "Book your table",
      },
      {
        dayOffset: 5,
        channel: "facebook",
        title: "Course preview",
        caption:
          "From amuse to dessert — here’s a peek at our Valentine’s set menu. Perfect for a night in (with us).",
        hashtags: "#ValentinesMenu #RomanticDinner",
        cta: "Reserve now",
      },
      {
        dayOffset: 9,
        channel: "email",
        title: "Booking reminder",
        caption:
          "Seats are filling for Valentine’s. Secure your prix-fixe booking before we’re fully booked.",
        hashtags: "#Valentines",
        cta: "Complete your reservation",
      },
      {
        dayOffset: 12,
        channel: "instagram",
        title: "Almost full",
        caption:
          "A few tables left for Valentine’s. Don’t leave it to chance — book the set menu today.",
        hashtags: "#LastTables #ValentinesNight",
        cta: "Book before we’re full",
      },
    ]),
  }),
  tpl({
    id: "resto_ugc_spotlight",
    industry: "restaurant_cafe",
    name: "Customer Spotlight (UGC)",
    promotion: "Tag & Win $100 voucher",
    defaultDurationDays: 30,
    suggestedClientPriceUsd: 399,
    markupPercent: 0.38,
    defaultChannels: ["instagram", "facebook"],
    availableChannels: [...SOCIAL],
    objective: "Generate UGC and local buzz with a voucher giveaway",
    keyMessage: "Tag us for a chance to win a $100 voucher",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "instagram",
        title: "Contest launch",
        caption:
          "Tag & Win: post your visit, tag us, and you could win a $100 voucher. One month to enter — winners announced soon.",
        hashtags: "#TagAndWin #CustomerLove #LocalEats",
        cta: "Post & tag us",
      },
      {
        dayOffset: 8,
        channel: "facebook",
        title: "How to enter",
        caption:
          "1) Dine with us 2) Share a photo 3) Tag our page. You’re in the draw for $100. Simple.",
        hashtags: "#Giveaway #FoodieContest",
        cta: "Enter this week",
      },
      {
        dayOffset: 18,
        channel: "instagram",
        title: "Feature a guest",
        caption:
          "Loving these guest shots 👏 Keep tagging — every eligible post is in the $100 voucher draw.",
        hashtags: "#GuestSpotlight #UGC",
        cta: "Your turn — tag us",
      },
      {
        dayOffset: 28,
        channel: "instagram",
        title: "Final week",
        caption:
          "Final week to Tag & Win. Get your post up before entries close for the $100 voucher.",
        hashtags: "#LastChance #TagAndWin",
        cta: "Enter before we close",
      },
    ]),
  }),
  tpl({
    id: "resto_loyalty_week",
    industry: "restaurant_cafe",
    name: "Loyalty Reward Week",
    promotion: "Double points",
    defaultDurationDays: 7,
    suggestedClientPriceUsd: 349,
    markupPercent: 0.45,
    defaultChannels: ["instagram", "facebook", "email"],
    availableChannels: [...SOCIAL_EMAIL],
    objective: "Reactivate loyalty members with double points",
    keyMessage: "This week — double points on every visit",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "instagram",
        title: "Double points week",
        caption:
          "Loyalty members: it’s Double Points Week. Every visit this week earns 2× — don’t sit this one out.",
        hashtags: "#LoyaltyRewards #DoublePoints",
        cta: "Check in & earn",
      },
      {
        dayOffset: 3,
        channel: "facebook",
        title: "Midweek nudge",
        caption:
          "Halfway through Double Points Week. Still time to stack rewards before Sunday.",
        hashtags: "#RewardsWeek",
        cta: "Visit before Sunday",
      },
      {
        dayOffset: 6,
        channel: "email",
        title: "Weekend reminder",
        caption:
          "Last chance for double points this weekend. Show your loyalty ID when you dine.",
        hashtags: "#Loyalty",
        cta: "Book this weekend",
      },
    ]),
  }),
  tpl({
    id: "resto_chefs_table",
    industry: "restaurant_cafe",
    name: "Chef's Table Experience",
    promotion: "Priority booking code",
    defaultDurationDays: 14,
    suggestedClientPriceUsd: 629,
    markupPercent: 0.4,
    defaultChannels: ["instagram", "facebook"],
    availableChannels: [...SOCIAL_EMAIL],
    objective: "Sell premium chef’s table bookings via priority code",
    keyMessage: "Priority booking code for the chef’s table",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "instagram",
        title: "Experience announce",
        caption:
          "An intimate chef’s table night — courses from the pass, stories from the kitchen. Priority code for early access.",
        hashtags: "#ChefsTable #FineDining",
        cta: "Request the priority code",
      },
      {
        dayOffset: 5,
        channel: "facebook",
        title: "What’s included",
        caption:
          "Multi-course tasting, wine pairings optional, front-row to the kitchen. Limited seats — priority booking open.",
        hashtags: "#TastingMenu #ExclusiveDining",
        cta: "Book with priority code",
      },
      {
        dayOffset: 10,
        channel: "instagram",
        title: "Seats filling",
        caption:
          "Chef’s table seats are going. Use your priority code now or risk missing the next sitting.",
        hashtags: "#BookNow #ChefsTable",
        cta: "Secure your seat",
      },
    ]),
  }),

  // ---- Retail / E-commerce (6) ----
  tpl({
    id: "retail_flash_friday",
    industry: "retail",
    name: "Flash Friday Sale",
    promotion: "30% off code (FLASH30)",
    defaultDurationDays: 1,
    suggestedClientPriceUsd: 449,
    markupPercent: 0.4,
    defaultChannels: ["instagram", "facebook", "tiktok"],
    availableChannels: [...SOCIAL_EMAIL],
    objective: "Drive a 24-hour traffic and conversion spike",
    keyMessage: "FLASH30 — 30% off for 24 hours only",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "instagram",
        title: "Flash live",
        caption:
          "24 hours only: code FLASH30 for 30% off. Clock’s ticking — shop before it’s gone.",
        hashtags: "#FlashSale #FLASH30 #ShopNow",
        cta: "Shop with FLASH30",
      },
      {
        dayOffset: 1,
        channel: "tiktok",
        title: "Urgency clip",
        caption:
          "FLASH30 is live for one day. 30% off — no excuses. Tap the link and go.",
        hashtags: "#FlashFriday #SaleAlert",
        cta: "Use FLASH30 today",
      },
      {
        dayOffset: 1,
        channel: "facebook",
        title: "Evening last call",
        caption:
          "Last hours for FLASH30. 30% off ends tonight — grab what you’ve been eyeing.",
        hashtags: "#LastChance #FlashSale",
        cta: "Checkout with FLASH30",
      },
    ]),
  }),
  tpl({
    id: "retail_collection_drop",
    industry: "retail",
    name: "New Collection Drop",
    promotion: "Early access code",
    defaultDurationDays: 14,
    suggestedClientPriceUsd: 799,
    markupPercent: 0.43,
    defaultChannels: ["instagram", "tiktok", "facebook"],
    availableChannels: [...SOCIAL_EMAIL],
    objective: "Launch a new collection with VIP early access",
    keyMessage: "Early access code — shop the drop first",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "instagram",
        title: "Drop teaser",
        caption:
          "New collection incoming. Early access code holders shop first — are you on the list?",
        hashtags: "#NewDrop #EarlyAccess #NewCollection",
        cta: "Get early access",
      },
      {
        dayOffset: 3,
        channel: "tiktok",
        title: "Lookbook clip",
        caption:
          "First look at the new collection. Early access is open — code in bio / link.",
        hashtags: "#Lookbook #DropDay",
        cta: "Shop early access",
      },
      {
        dayOffset: 7,
        channel: "facebook",
        title: "Public launch",
        caption:
          "The wait is over — full collection is live. Missed early access? It’s all here now.",
        hashtags: "#NewArrivals #ShopTheDrop",
        cta: "Shop the collection",
      },
      {
        dayOffset: 12,
        channel: "instagram",
        title: "Bestsellers",
        caption:
          "These pieces are moving fast. If it’s on your wishlist, don’t wait.",
        hashtags: "#Bestsellers #NewCollection",
        cta: "Shop before restock",
      },
    ]),
  }),
  tpl({
    id: "retail_bf_prep",
    industry: "retail",
    name: "Black Friday Prep",
    promotion: "Early access link",
    defaultDurationDays: 14,
    suggestedClientPriceUsd: 1099,
    markupPercent: 0.41,
    defaultChannels: ["instagram", "facebook", "email"],
    availableChannels: [...SOCIAL_EMAIL],
    objective: "Build Black Friday list and early-access demand",
    keyMessage: "Get the early access link before Black Friday",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "instagram",
        title: "BF early access",
        caption:
          "Black Friday prep starts now. Join early access for first dibs before the public rush.",
        hashtags: "#BlackFriday #EarlyAccess #BFCM",
        cta: "Get your early access link",
      },
      {
        dayOffset: 5,
        channel: "facebook",
        title: "What’s coming",
        caption:
          "Sneak peek: our deepest deals of the year. Early access subscribers go first.",
        hashtags: "#BlackFridayDeals",
        cta: "Sign up for early access",
      },
      {
        dayOffset: 10,
        channel: "email",
        title: "Link drop",
        caption:
          "Your Black Friday early access link is ready. Shop before we open to everyone.",
        hashtags: "#EarlyAccess",
        cta: "Open early access",
      },
      {
        dayOffset: 13,
        channel: "instagram",
        title: "Countdown",
        caption:
          "Hours until public Black Friday. Early access is still open for a short window.",
        hashtags: "#BFCountdown",
        cta: "Use your early access link",
      },
    ]),
  }),
  tpl({
    id: "retail_free_ship",
    industry: "retail",
    name: "Free Shipping Weekend",
    promotion: "Free shipping code",
    defaultDurationDays: 3,
    suggestedClientPriceUsd: 349,
    markupPercent: 0.4,
    defaultChannels: ["instagram", "facebook"],
    availableChannels: [...SOCIAL_EMAIL],
    objective: "Lift conversion with a free-shipping weekend",
    keyMessage: "Free shipping code — this weekend only",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "instagram",
        title: "Weekend starts",
        caption:
          "Free shipping all weekend. Use the code at checkout — stock up without the delivery fee.",
        hashtags: "#FreeShipping #WeekendSale",
        cta: "Shop with free shipping",
      },
      {
        dayOffset: 2,
        channel: "facebook",
        title: "Mid-weekend",
        caption:
          "Still free to your door this weekend. Cart’s waiting — code applied at checkout.",
        hashtags: "#FreeDelivery",
        cta: "Complete your order",
      },
      {
        dayOffset: 3,
        channel: "instagram",
        title: "Ends tonight",
        caption:
          "Free shipping ends tonight. Last chance to skip shipping costs.",
        hashtags: "#LastDay #FreeShipping",
        cta: "Checkout before midnight",
      },
    ]),
  }),
  tpl({
    id: "retail_bundle_save",
    industry: "retail",
    name: "Bundle & Save",
    promotion: "Bundle deal promo",
    defaultDurationDays: 14,
    suggestedClientPriceUsd: 499,
    markupPercent: 0.39,
    defaultChannels: ["instagram", "facebook"],
    availableChannels: [...SOCIAL_EMAIL],
    objective: "Increase AOV with curated bundles",
    keyMessage: "Bundle & save — more value, one checkout",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "instagram",
        title: "Bundles live",
        caption:
          "Bundle & Save is on. Curated sets at a better price than buying solo — two weeks only.",
        hashtags: "#BundleAndSave #ValuePack",
        cta: "Shop bundles",
      },
      {
        dayOffset: 6,
        channel: "facebook",
        title: "Pick your bundle",
        caption:
          "Not sure where to start? Our most-loved bundles are ready — save when you take the set.",
        hashtags: "#ShopBundles",
        cta: "See bundle deals",
      },
      {
        dayOffset: 12,
        channel: "instagram",
        title: "Offer ending",
        caption:
          "Bundle pricing ends soon. Lock in the set before it reverts to regular.",
        hashtags: "#BundleDeal #SaveMore",
        cta: "Grab your bundle",
      },
    ]),
  }),
  tpl({
    id: "retail_clearance",
    industry: "retail",
    name: "Last Chance Clearance",
    promotion: "Final markdown code",
    defaultDurationDays: 5,
    suggestedClientPriceUsd: 399,
    markupPercent: 0.41,
    defaultChannels: ["instagram", "facebook", "email"],
    availableChannels: [...SOCIAL_EMAIL],
    objective: "Clear remaining stock with final markdowns",
    keyMessage: "Final markdown code — last chance clearance",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "instagram",
        title: "Clearance open",
        caption:
          "Last chance clearance: final markdowns with our code. When it’s gone, it’s gone.",
        hashtags: "#Clearance #FinalSale #Markdown",
        cta: "Shop clearance",
      },
      {
        dayOffset: 3,
        channel: "facebook",
        title: "Sizes going",
        caption:
          "Sizes and colours disappearing fast. Final markdown code still active for a few more days.",
        hashtags: "#LastChance",
        cta: "Use the markdown code",
      },
      {
        dayOffset: 5,
        channel: "email",
        title: "Ends today",
        caption:
          "Clearance ends today. Final call on marked-down pieces — use your code at checkout.",
        hashtags: "#FinalHours",
        cta: "Shop before it ends",
      },
    ]),
  }),

  // ---- Fast Food / QSR (4) ----
  tpl({
    id: "qsr_app_download",
    industry: "fast_food",
    name: "App Download Boost",
    promotion: "App-exclusive first order deal",
    defaultDurationDays: 14,
    suggestedClientPriceUsd: 449,
    markupPercent: 0.44,
    defaultChannels: ["instagram", "tiktok", "facebook"],
    availableChannels: [...SOCIAL],
    objective: "Grow app installs with a first-order exclusive",
    keyMessage: "Download the app — exclusive first-order deal inside",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "tiktok",
        title: "App deal drop",
        caption:
          "App-only first order deal is live. Download, claim, and save on your next meal.",
        hashtags: "#AppDeal #FirstOrder #QSR",
        cta: "Download the app",
      },
      {
        dayOffset: 4,
        channel: "instagram",
        title: "How it works",
        caption:
          "1) Get the app 2) Unlock the first-order deal 3) Order. Two weeks to claim.",
        hashtags: "#AppExclusive #FoodDeal",
        cta: "Claim in-app",
      },
      {
        dayOffset: 9,
        channel: "facebook",
        title: "Social proof",
        caption:
          "Thousands are ordering through the app this week. Your first-order deal is waiting.",
        hashtags: "#OrderAhead",
        cta: "Get the app deal",
      },
      {
        dayOffset: 13,
        channel: "instagram",
        title: "Offer closing",
        caption:
          "App first-order deal ends soon. Download now if you haven’t already.",
        hashtags: "#LastChance #AppOffer",
        cta: "Download before it ends",
      },
    ]),
  }),
  tpl({
    id: "qsr_combo_launch",
    industry: "fast_food",
    name: "Combo Meal Launch",
    promotion: "$2 off combo code",
    defaultDurationDays: 14,
    suggestedClientPriceUsd: 549,
    markupPercent: 0.38,
    defaultChannels: ["instagram", "tiktok", "facebook"],
    availableChannels: [...SOCIAL],
    objective: "Launch a new combo with a $2-off code",
    keyMessage: "$2 off combo — use the code this fortnight",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "instagram",
        title: "Combo reveal",
        caption:
          "New combo just dropped. Use the code for $2 off — two weeks only.",
        hashtags: "#ComboDeal #NewCombo #ValueMeal",
        cta: "Order with $2 off",
      },
      {
        dayOffset: 5,
        channel: "tiktok",
        title: "Unbox the combo",
        caption:
          "Here’s what’s in the new combo. Code for $2 off in bio — go get it.",
        hashtags: "#FoodTok #ComboLaunch",
        cta: "Grab the combo deal",
      },
      {
        dayOffset: 10,
        channel: "facebook",
        title: "Family angle",
        caption:
          "Feeding the crew? Stack combos with $2 off each using the launch code.",
        hashtags: "#FamilyMeal #Combo",
        cta: "Order today",
      },
    ]),
  }),
  tpl({
    id: "qsr_late_night",
    industry: "fast_food",
    name: "Late Night Munchies",
    promotion: "After-hours app deal",
    defaultDurationDays: 30,
    ongoing: true,
    suggestedClientPriceUsd: 379,
    markupPercent: 0.46,
    defaultChannels: ["instagram", "tiktok"],
    availableChannels: [...SOCIAL],
    objective: "Drive after-hours app orders with an ongoing night deal",
    keyMessage: "After-hours app deal for late-night cravings",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "tiktok",
        title: "Night deal",
        caption:
          "When the craving hits after dark — open the app. After-hours deal unlocked.",
        hashtags: "#LateNightEats #Munchies #AppDeal",
        cta: "Order in the app",
      },
      {
        dayOffset: 8,
        channel: "instagram",
        title: "Hours reminder",
        caption:
          "Late-night menu + app-only savings. We’re open when you need us.",
        hashtags: "#NightOwl #LateNight",
        cta: "Check after-hours deal",
      },
      {
        dayOffset: 18,
        channel: "instagram",
        title: "Weekend nights",
        caption:
          "Weekend nights sorted. After-hours app deal still on — order from the couch.",
        hashtags: "#WeekendEats #AppOrder",
        cta: "Open the app",
      },
    ]),
  }),
  tpl({
    id: "qsr_family_bundle",
    industry: "fast_food",
    name: "Family Bundle Deal",
    promotion: "Extra $5 off family bundle",
    defaultDurationDays: 7,
    suggestedClientPriceUsd: 399,
    markupPercent: 0.42,
    defaultChannels: ["facebook", "instagram"],
    availableChannels: [...SOCIAL],
    objective: "Boost family-size orders with an extra $5 off",
    keyMessage: "Extra $5 off the family bundle this week",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "facebook",
        title: "Family bundle week",
        caption:
          "Family night covered: extra $5 off our family bundle this week only.",
        hashtags: "#FamilyBundle #FeedTheFam",
        cta: "Order the family bundle",
      },
      {
        dayOffset: 3,
        channel: "instagram",
        title: "What’s in the box",
        caption:
          "Enough for everyone + $5 extra off. Family bundle deal ends Sunday.",
        hashtags: "#FamilyMeal #Deal",
        cta: "Claim $5 off",
      },
      {
        dayOffset: 6,
        channel: "facebook",
        title: "Weekend last call",
        caption:
          "Last weekend for the extra $5 family bundle saving. Order before it ends.",
        hashtags: "#LastChance",
        cta: "Order now",
      },
    ]),
  }),

  // ---- Hotels / Hospitality (5) ----
  tpl({
    id: "hotel_weekend_getaway",
    industry: "hotel",
    name: "Weekend Getaway Package",
    promotion: "20% off weekend rate",
    defaultDurationDays: 14,
    suggestedClientPriceUsd: 699,
    markupPercent: 0.4,
    defaultChannels: ["instagram", "facebook", "email"],
    availableChannels: [...SOCIAL_EMAIL],
    objective: "Fill weekend rooms with a 20% off package",
    keyMessage: "20% off weekend rates — book your getaway",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "instagram",
        title: "Package hero",
        caption:
          "Weekend escape: 20% off our weekend rate for a limited window. Book direct and save.",
        hashtags: "#WeekendGetaway #HotelDeal #Staycation",
        cta: "Book weekend stay",
      },
      {
        dayOffset: 5,
        channel: "facebook",
        title: "Amenities",
        caption:
          "Pool, breakfast, and a softer rate this fortnight. Your weekend reset starts here.",
        hashtags: "#HotelOffer #Getaway",
        cta: "Check availability",
      },
      {
        dayOffset: 10,
        channel: "email",
        title: "Past guests",
        caption:
          "As a past guest: 20% off weekend rates is open. Preferential booking link inside.",
        hashtags: "#GuestOffer",
        cta: "Book with 20% off",
      },
      {
        dayOffset: 13,
        channel: "instagram",
        title: "Last rooms",
        caption:
          "Weekend package rooms are limited. Lock in 20% off before the offer closes.",
        hashtags: "#LastRooms",
        cta: "Reserve now",
      },
    ]),
  }),
  tpl({
    id: "hotel_off_season",
    industry: "hotel",
    name: "Off-Season Special",
    promotion: "Stay & Save rate",
    defaultDurationDays: 30,
    suggestedClientPriceUsd: 899,
    markupPercent: 0.38,
    defaultChannels: ["facebook", "instagram", "google_business"],
    availableChannels: [...SOCIAL_EMAIL],
    objective: "Lift off-season occupancy with Stay & Save",
    keyMessage: "Stay & Save — off-season rates for a full month",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "facebook",
        title: "Stay & Save",
        caption:
          "Off-season is the secret season. Stay & Save rates all month — more calm, better value.",
        hashtags: "#OffSeason #StayAndSave #HotelRates",
        cta: "View Stay & Save rates",
      },
      {
        dayOffset: 10,
        channel: "instagram",
        title: "Quiet luxury",
        caption:
          "Fewer crowds, same hospitality. Our Stay & Save rate is made for midweek and month-long planners.",
        hashtags: "#QuietEscape",
        cta: "Book off-season",
      },
      {
        dayOffset: 20,
        channel: "google_business",
        title: "Local staycation",
        caption:
          "Locals: Stay & Save rates available this month. Perfect for a nearby reset.",
        hashtags: "#Staycation",
        cta: "Call or book online",
      },
      {
        dayOffset: 28,
        channel: "email",
        title: "Month ending",
        caption:
          "Stay & Save closes at month end. Secure your off-season dates while rates hold.",
        hashtags: "#LimitedRate",
        cta: "Book before rates change",
      },
    ]),
  }),
  tpl({
    id: "hotel_wedding_venue",
    industry: "hotel",
    name: "Wedding Venue Showcase",
    promotion: "Free private venue tour",
    defaultDurationDays: 21,
    suggestedClientPriceUsd: 749,
    markupPercent: 0.41,
    defaultChannels: ["instagram", "facebook"],
    availableChannels: [...SOCIAL_EMAIL],
    objective: "Book wedding venue tours and enquiries",
    keyMessage: "Free private venue tour for couples",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "instagram",
        title: "Venue beauty",
        caption:
          "Saying yes to the venue. Book a free private tour and picture your day here.",
        hashtags: "#WeddingVenue #WeddingTour #SayIDo",
        cta: "Book a free tour",
      },
      {
        dayOffset: 8,
        channel: "facebook",
        title: "Packages overview",
        caption:
          "Ceremonies, receptions, and overnight stays for guests. Start with a complimentary private tour.",
        hashtags: "#WeddingPlanning",
        cta: "Request your tour",
      },
      {
        dayOffset: 15,
        channel: "instagram",
        title: "Real wedding",
        caption:
          "Another beautiful celebration under our roof. Couples: free tours still open this month.",
        hashtags: "#RealWedding #VenueShowcase",
        cta: "Schedule a tour",
      },
    ]),
  }),
  tpl({
    id: "hotel_business_traveler",
    industry: "hotel",
    name: "Business Traveler Perk",
    promotion: "Corporate rate program",
    defaultDurationDays: 30,
    ongoing: true,
    suggestedClientPriceUsd: 549,
    markupPercent: 0.44,
    defaultChannels: ["facebook", "instagram", "email"],
    availableChannels: ["facebook", "instagram", "google_business", "email"],
    objective: "Enrol corporates into an ongoing rate program",
    keyMessage: "Join our corporate rate program",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "facebook",
        title: "Corporate rates",
        caption:
          "Travelling for work? Our corporate rate program keeps stays simple and consistently priced.",
        hashtags: "#BusinessTravel #CorporateRate",
        cta: "Enquire about corporate rates",
      },
      {
        dayOffset: 12,
        channel: "email",
        title: "Program benefits",
        caption:
          "Flexible cancellation windows, negotiated rates, and priority rooms — ask about enrolment.",
        hashtags: "#CorporateTravel",
        cta: "Join the program",
      },
      {
        dayOffset: 22,
        channel: "google_business",
        title: "Local business stays",
        caption:
          "Nearby companies: set up a corporate rate for your team’s overnight needs.",
        hashtags: "#BusinessHotel",
        cta: "Contact sales",
      },
    ]),
  }),
  tpl({
    id: "hotel_review_reward",
    industry: "hotel",
    name: "Review Reward (UGC)",
    promotion: "Review for 10% off",
    defaultDurationDays: 30,
    suggestedClientPriceUsd: 399,
    markupPercent: 0.45,
    defaultChannels: ["instagram", "facebook", "google_business"],
    availableChannels: [...SOCIAL_EMAIL],
    objective: "Grow reviews with a 10% off reward",
    keyMessage: "Leave a review — get 10% off your next stay",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "instagram",
        title: "Review reward",
        caption:
          "Loved your stay? Leave a review and claim 10% off your next booking.",
        hashtags: "#GuestReview #ReviewReward",
        cta: "Review & save 10%",
      },
      {
        dayOffset: 12,
        channel: "google_business",
        title: "Google review CTA",
        caption:
          "Share your experience on Google. Mention your stay dates to redeem 10% off next time.",
        hashtags: "#GoogleReview",
        cta: "Leave a Google review",
      },
      {
        dayOffset: 24,
        channel: "facebook",
        title: "Still running",
        caption:
          "Review reward is open all month: honest feedback + 10% off your return visit.",
        hashtags: "#ThankYouGuests",
        cta: "Redeem after you review",
      },
    ]),
  }),

  // ---- Fitness / Gym (4) ----
  tpl({
    id: "fitness_new_year",
    industry: "fitness",
    name: "New Year Transformation",
    promotion: "Joining fee waived",
    defaultDurationDays: 42,
    suggestedClientPriceUsd: 599,
    markupPercent: 0.39,
    defaultChannels: ["instagram", "facebook"],
    availableChannels: [...SOCIAL_EMAIL],
    objective: "Convert January joiners with waived joining fee",
    keyMessage: "Joining fee waived — start your transformation",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "instagram",
        title: "New year offer",
        caption:
          "New year, new you — joining fee waived for a limited window. Start strong.",
        hashtags: "#NewYearFitness #GymOffer #Transformation",
        cta: "Join with fee waived",
      },
      {
        dayOffset: 10,
        channel: "facebook",
        title: "Programs overview",
        caption:
          "Classes, floor, and coaching ready when you are. Waived joining fee still on.",
        hashtags: "#GymLife #NewYearGoals",
        cta: "Book a tour",
      },
      {
        dayOffset: 24,
        channel: "instagram",
        title: "Member story",
        caption:
          "Real members, real progress. Your turn — joining fee waived for a few more weeks.",
        hashtags: "#MemberSpotlight",
        cta: "Start today",
      },
      {
        dayOffset: 38,
        channel: "facebook",
        title: "Offer ending",
        caption:
          "Last weeks of waived joining fee. Don’t push your goals to next month.",
        hashtags: "#LastChance #JoinNow",
        cta: "Claim waived fee",
      },
    ]),
  }),
  tpl({
    id: "fitness_bring_friend",
    industry: "fitness",
    name: "Bring a Friend Free",
    promotion: "Referral: free month",
    defaultDurationDays: 14,
    suggestedClientPriceUsd: 349,
    markupPercent: 0.43,
    defaultChannels: ["instagram", "facebook"],
    availableChannels: [...SOCIAL],
    objective: "Drive referrals with a free month for friends",
    keyMessage: "Bring a friend — they get a free month",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "instagram",
        title: "Referral launch",
        caption:
          "Bring a friend free: they train on us for a month when you refer. Win-win.",
        hashtags: "#BringAFriend #GymReferral",
        cta: "Refer a friend",
      },
      {
        dayOffset: 6,
        channel: "facebook",
        title: "How to refer",
        caption:
          "Tell the front desk or use the referral link. Your friend gets a free month — you get a training buddy.",
        hashtags: "#ReferralReward",
        cta: "Get your referral link",
      },
      {
        dayOffset: 12,
        channel: "instagram",
        title: "Two weeks left",
        caption:
          "Referral window closes soon. Bring your person before free month ends.",
        hashtags: "#TrainTogether",
        cta: "Invite them this week",
      },
    ]),
  }),
  tpl({
    id: "fitness_summer",
    industry: "fitness",
    name: "Summer Shape-Up",
    promotion: "Summer membership rate",
    defaultDurationDays: 28,
    suggestedClientPriceUsd: 499,
    markupPercent: 0.4,
    defaultChannels: ["instagram", "tiktok", "facebook"],
    availableChannels: [...SOCIAL_EMAIL],
    objective: "Sell summer memberships at a seasonal rate",
    keyMessage: "Summer membership rate — shape up for the season",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "instagram",
        title: "Summer rate",
        caption:
          "Summer Shape-Up is on. Special membership rate for the next four weeks.",
        hashtags: "#SummerFitness #ShapeUp #GymDeal",
        cta: "Lock summer rate",
      },
      {
        dayOffset: 10,
        channel: "tiktok",
        title: "Workout energy",
        caption:
          "Heat’s rising — so is the training. Summer rate still available.",
        hashtags: "#SummerGym #FitnessTok",
        cta: "Join at summer rate",
      },
      {
        dayOffset: 20,
        channel: "facebook",
        title: "Two weeks left",
        caption:
          "Two weeks left on the summer membership rate. Get ahead of the season.",
        hashtags: "#SummerReady",
        cta: "Sign up now",
      },
    ]),
  }),
  tpl({
    id: "fitness_class_pack",
    industry: "fitness",
    name: "Class Pack Special",
    promotion: "25% off 10-class pack",
    defaultDurationDays: 7,
    suggestedClientPriceUsd: 299,
    markupPercent: 0.46,
    defaultChannels: ["instagram", "facebook"],
    availableChannels: [...SOCIAL],
    objective: "Sell class packs with a one-week discount",
    keyMessage: "25% off 10-class packs this week",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "instagram",
        title: "Pack special",
        caption:
          "10-class packs at 25% off — this week only. Book your favourite classes ahead.",
        hashtags: "#ClassPack #GymSpecial #StudioLife",
        cta: "Buy a class pack",
      },
      {
        dayOffset: 3,
        channel: "facebook",
        title: "Midweek reminder",
        caption:
          "Halfway through Class Pack Special week. 25% off won’t wait.",
        hashtags: "#FitnessDeal",
        cta: "Grab 25% off",
      },
      {
        dayOffset: 6,
        channel: "instagram",
        title: "Ends tomorrow",
        caption:
          "Class pack discount ends tomorrow. Lock in 10 sessions while they’re on sale.",
        hashtags: "#LastChance",
        cta: "Purchase before midnight",
      },
    ]),
  }),

  // ---- Beauty / Salon (3) ----
  tpl({
    id: "beauty_new_service",
    industry: "beauty_salon",
    name: "New Service Launch",
    promotion: "Intro price code",
    defaultDurationDays: 14,
    suggestedClientPriceUsd: 449,
    markupPercent: 0.38,
    defaultChannels: ["instagram", "facebook"],
    availableChannels: [...SOCIAL_EMAIL],
    objective: "Launch a new service with intro pricing",
    keyMessage: "New service — intro price code for two weeks",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "instagram",
        title: "Service launch",
        caption:
          "New on the menu. Intro price code for the first two weeks — book early.",
        hashtags: "#NewService #SalonLaunch #Beauty",
        cta: "Book with intro code",
      },
      {
        dayOffset: 6,
        channel: "facebook",
        title: "Who it’s for",
        caption:
          "Curious about our newest treatment? Intro pricing makes it easy to try.",
        hashtags: "#SalonSpecial",
        cta: "Reserve your slot",
      },
      {
        dayOffset: 12,
        channel: "instagram",
        title: "Intro ending",
        caption:
          "Intro price ends soon. Use the code before we move to full rate.",
        hashtags: "#LimitedOffer #BeautyDeal",
        cta: "Book this week",
      },
    ]),
  }),
  tpl({
    id: "beauty_pamper",
    industry: "beauty_salon",
    name: "Pamper Package",
    promotion: "Bundle deal",
    defaultDurationDays: 30,
    ongoing: true,
    suggestedClientPriceUsd: 379,
    markupPercent: 0.42,
    defaultChannels: ["instagram", "facebook"],
    availableChannels: [...SOCIAL_EMAIL],
    objective: "Sell ongoing pamper bundles",
    keyMessage: "Pamper package — bundled treatments, better value",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "instagram",
        title: "Package reveal",
        caption:
          "The Pamper Package: curated treatments in one visit. Better together, better value.",
        hashtags: "#PamperPackage #SelfCare #SalonBundle",
        cta: "Book the package",
      },
      {
        dayOffset: 12,
        channel: "facebook",
        title: "Gift idea",
        caption:
          "Gift cards and pamper packages available — treat someone (or yourself).",
        hashtags: "#GiftIdea #SpaDay",
        cta: "Enquire about packages",
      },
      {
        dayOffset: 24,
        channel: "instagram",
        title: "Still available",
        caption:
          "Our pamper bundle is always ready when you need a reset. Book when it suits you.",
        hashtags: "#SelfCareSunday",
        cta: "Schedule your pamper",
      },
    ]),
  }),
  tpl({
    id: "beauty_birthday",
    industry: "beauty_salon",
    name: "Birthday Month Treat",
    promotion: "15% off birthday code",
    defaultDurationDays: 30,
    ongoing: true,
    suggestedClientPriceUsd: 299,
    markupPercent: 0.44,
    defaultChannels: ["instagram", "facebook", "email"],
    availableChannels: [...SOCIAL_EMAIL],
    objective: "Drive birthday-month bookings year-round",
    keyMessage: "15% off in your birthday month",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "instagram",
        title: "Birthday treat",
        caption:
          "It’s your month — enjoy 15% off with our birthday code. Celebrate looking your best.",
        hashtags: "#BirthdayTreat #SalonOffer",
        cta: "Book with birthday code",
      },
      {
        dayOffset: 10,
        channel: "email",
        title: "Members reminder",
        caption:
          "Birthday month? Your 15% off code is waiting. Book any service this month.",
        hashtags: "#Birthday",
        cta: "Redeem 15% off",
      },
      {
        dayOffset: 20,
        channel: "facebook",
        title: "Ongoing perk",
        caption:
          "Every client gets a birthday month treat: 15% off. Tell us your date when you book.",
        hashtags: "#ClientLove",
        cta: "Mention your birthday",
      },
    ]),
  }),

  // ---- Professional Services (2) ----
  tpl({
    id: "pro_free_consult",
    industry: "professional",
    name: "Free Consultation Month",
    promotion: "Free 30-min consultation",
    defaultDurationDays: 30,
    suggestedClientPriceUsd: 549,
    markupPercent: 0.41,
    defaultChannels: ["facebook", "instagram", "email"],
    availableChannels: [...SOCIAL_EMAIL],
    objective: "Fill the calendar with free consult bookings",
    keyMessage: "Free 30-minute consultation all month",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "facebook",
        title: "Consult month",
        caption:
          "This month: free 30-minute consultations. No obligation — just clarity on your next step.",
        hashtags: "#FreeConsultation #ProfessionalAdvice",
        cta: "Book a free consult",
      },
      {
        dayOffset: 10,
        channel: "instagram",
        title: "What to expect",
        caption:
          "30 minutes. Your questions. Our expertise. Free consults available all month.",
        hashtags: "#ExpertAdvice #BookNow",
        cta: "Reserve your slot",
      },
      {
        dayOffset: 20,
        channel: "email",
        title: "Slots remaining",
        caption:
          "Free consultation month is popular — remaining slots are limited. Book while they’re open.",
        hashtags: "#Consultation",
        cta: "Schedule today",
      },
      {
        dayOffset: 28,
        channel: "facebook",
        title: "Month end",
        caption:
          "Last days of free consultations. Don’t wait until next quarter to get answers.",
        hashtags: "#LastChance",
        cta: "Book before month end",
      },
    ]),
  }),
  tpl({
    id: "pro_success_stories",
    industry: "professional",
    name: "Client Success Stories",
    promotion: "None (testimonial campaign)",
    defaultDurationDays: 21,
    suggestedClientPriceUsd: 699,
    markupPercent: 0.4,
    defaultChannels: ["facebook", "instagram", "email"],
    availableChannels: [...SOCIAL_EMAIL],
    objective: "Build trust with a testimonial-led awareness campaign",
    keyMessage: "Real client outcomes — see what’s possible",
    outlines: posts([
      {
        dayOffset: 1,
        channel: "facebook",
        title: "Story 1",
        caption:
          "Client success starts with listening. Here’s how we helped one client move forward — results that speak.",
        hashtags: "#ClientSuccess #Testimonials",
        cta: "Read the story / enquire",
      },
      {
        dayOffset: 7,
        channel: "instagram",
        title: "Story 2",
        caption:
          "Another win worth sharing. Real challenges, practical solutions, measurable progress.",
        hashtags: "#CaseStudy #Proof",
        cta: "See how we work",
      },
      {
        dayOffset: 14,
        channel: "email",
        title: "Outcomes roundup",
        caption:
          "Three weeks of client stories — and an open invite to talk about yours.",
        hashtags: "#Results",
        cta: "Start a conversation",
      },
      {
        dayOffset: 20,
        channel: "facebook",
        title: "Your turn",
        caption:
          "Inspired by these outcomes? Let’s map what success looks like for you.",
        hashtags: "#GetStarted",
        cta: "Book an intro call",
      },
    ]),
  }),
];

/** Built-in platform catalog only (no tenant customs). */
export function listPromoTemplates(): PromoTemplate[] {
  return CATALOG;
}

export function agencyTemplateToPromo(t: AgencyPromoTemplate): PromoTemplate {
  const media =
    Math.round((t.suggestedClientPriceUsd / (1 + t.markupPercent)) * 100) / 100;
  return {
    id: t.id,
    industry: t.industry,
    name: t.name,
    promotion: t.promotion,
    blurb: t.blurb ?? t.promotion,
    defaultDurationDays: t.defaultDurationDays,
    ongoing: t.ongoing,
    suggestedClientPriceUsd: t.suggestedClientPriceUsd,
    markupPercent: t.markupPercent,
    suggestedBudgetUsd: media,
    defaultChannels: t.defaultChannels,
    availableChannels: t.availableChannels,
    objective: t.objective,
    keyMessage: t.keyMessage,
    outlines: t.outlines.map((o) => ({
      dayOffset: o.dayOffset,
      channel: o.channel,
      contentType: (o.contentType === "email_newsletter"
        ? "email_newsletter"
        : o.channel === "email"
          ? "email_newsletter"
          : "social_post") as RequestType,
      title: o.title,
      caption: o.caption,
      hashtags: o.hashtags,
      cta: o.cta,
    })),
  };
}

export function listAgencyPromoTemplates(
  catalog: AgencyPromoTemplate[] | undefined,
  opts?: { includeInactive?: boolean },
): PromoTemplate[] {
  const rows = catalog ?? [];
  return rows
    .filter((t) => opts?.includeInactive || t.active !== false)
    .map(agencyTemplateToPromo);
}

/** Platform + active agency templates. Same-id agency rows override built-ins. */
export function listAllPromoTemplates(
  agencyCatalog?: AgencyPromoTemplate[],
): PromoTemplate[] {
  const allAgency = agencyCatalog ?? [];
  const byId = new Map(allAgency.map((t) => [t.id, t]));
  const out: PromoTemplate[] = [];
  for (const t of CATALOG) {
    const ov = byId.get(t.id);
    if (ov) {
      if (ov.active === false) continue;
      out.push(agencyTemplateToPromo(ov));
    } else {
      out.push(t);
    }
  }
  for (const t of allAgency) {
    if (CATALOG.some((p) => p.id === t.id)) continue;
    if (t.active === false) continue;
    out.push(agencyTemplateToPromo(t));
  }
  return out;
}

export function isPlatformPromoId(id: string): boolean {
  return CATALOG.some((t) => t.id === id);
}

export function getPromoTemplate(id: string): PromoTemplate | undefined {
  return CATALOG.find((t) => t.id === id);
}

/** Prefer tenant override (including hidden → undefined) over built-in. */
export function resolvePromoTemplate(
  id: string,
  agencyCatalog?: AgencyPromoTemplate[],
): PromoTemplate | undefined {
  const ov = (agencyCatalog ?? []).find((t) => t.id === id);
  if (ov) {
    if (ov.active === false) return undefined;
    return agencyTemplateToPromo(ov);
  }
  return getPromoTemplate(id);
}

/** Effective template for the edit form (includes inactive overrides). */
export function resolvePromoTemplateForEdit(
  id: string,
  agencyCatalog?: AgencyPromoTemplate[],
): { template: PromoTemplate; override: AgencyPromoTemplate | null; isPlatform: boolean } | null {
  const override = (agencyCatalog ?? []).find((t) => t.id === id) ?? null;
  if (override) {
    return {
      template: agencyTemplateToPromo(override),
      override,
      isPlatform: isPlatformPromoId(id),
    };
  }
  const builtIn = getPromoTemplate(id);
  if (builtIn) {
    return { template: builtIn, override: null, isPlatform: true };
  }
  return null;
}

export const PROMO_INDUSTRY_OPTIONS: { id: PromoIndustry; label: string }[] = [
  { id: "restaurant_cafe", label: "Restaurant / café" },
  { id: "retail", label: "Retail / e-commerce" },
  { id: "fast_food", label: "Fast food / QSR" },
  { id: "hotel", label: "Hotels / hospitality" },
  { id: "fitness", label: "Fitness / gym" },
  { id: "beauty_salon", label: "Beauty / salon" },
  { id: "professional", label: "Professional services" },
  { id: "other", label: "General / other" },
];

/** Map company business type (+ industry text) to promo industries to show. */
export function promoIndustriesForCompany(company: Company): PromoIndustry[] {
  const bt = resolveBusinessType(company);
  const industry = (company.profile.industry ?? "").toLowerCase();
  const out: PromoIndustry[] = [];

  if (/gym|fitness|yoga|pilates|crossfit|personal train/.test(industry)) {
    out.push("fitness");
  }
  if (/beauty|salon|spa|nail|hair|barber|aesthetic/.test(industry)) {
    out.push("beauty_salon");
  }
  if (/fast.?food|qsr|quick service|burger|fried chicken|pizza take/.test(industry)) {
    out.push("fast_food");
  }

  if (bt === "other") {
    if (out.length > 0) return [...new Set(out)];
    return [
      "retail",
      "restaurant_cafe",
      "fast_food",
      "hotel",
      "fitness",
      "beauty_salon",
      "professional",
      "other",
    ];
  }

  out.push(bt);
  if (
    bt === "restaurant_cafe" &&
    /fast.?food|qsr|quick service|burger|fried chicken|pizza take/.test(industry)
  ) {
    if (!out.includes("fast_food")) out.push("fast_food");
  }

  return [...new Set(out)];
}

export function templatesForCompany(
  company: Company,
  agencyCatalog?: AgencyPromoTemplate[],
): PromoTemplate[] {
  const industries = new Set(promoIndustriesForCompany(company));
  return listAllPromoTemplates(agencyCatalog).filter((t) => industries.has(t.industry));
}

export function resolvePromoMarkupPercent(
  company: Company,
  template?: PromoTemplate,
): number {
  if (template) return template.markupPercent;
  const raw = company.profile.managedService?.promoMarkupPercent;
  if (typeof raw === "number" && raw >= 0 && raw <= 1) return raw;
  return DEFAULT_PROMO_MARKUP_PERCENT;
}

/**
 * Package pricing: clientPrice is what the client pays.
 * Markup is on delivery cost → media = total / (1 + markup), fee = total − media.
 */
export function computePromoPricing(clientPriceUsd: number, markupPercent: number) {
  const totalUsd = Math.max(0, clientPriceUsd);
  const m = Math.max(0, markupPercent);
  const budgetUsd = Math.round((totalUsd / (1 + m)) * 100) / 100;
  const feeUsd = Math.round((totalUsd - budgetUsd) * 100) / 100;
  return { budgetUsd, markupPercent: m, feeUsd, totalUsd };
}

export function addDaysIso(startDate: string, days: number): string {
  const d = new Date(`${startDate.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.max(0, days));
  return d.toISOString().slice(0, 10);
}

export function filterOutlinesForChannels(
  template: PromoTemplate,
  channels: string[],
): PromoTemplateOutline[] {
  const set = new Set(channels.map((c) => c.toLowerCase()));
  const filtered = template.outlines.filter((o) => set.has(o.channel.toLowerCase()));
  if (filtered.length > 0) return filtered;
  const ch = channels[0] ?? template.defaultChannels[0] ?? "facebook";
  return template.outlines.slice(0, 3).map((o, i) => ({
    ...o,
    channel: ch,
    dayOffset: o.dayOffset || i + 1,
  }));
}

export function industryLabel(industry: PromoIndustry): string {
  const map: Record<PromoIndustry, string> = {
    retail: "Retail / e-commerce",
    restaurant_cafe: "Restaurant / café",
    fast_food: "Fast food / QSR",
    hotel: "Hotels / hospitality",
    fitness: "Fitness / gym",
    beauty_salon: "Beauty / salon",
    professional: "Professional services",
    other: "General",
  };
  return map[industry] ?? industry;
}

export function durationLabel(template: PromoTemplate): string {
  if (template.ongoing) return "Ongoing";
  const d = template.defaultDurationDays;
  if (d === 1) return "24 hours";
  if (d % 7 === 0 && d <= 42) {
    const w = d / 7;
    return w === 1 ? "1 week" : `${w} weeks`;
  }
  if (d === 30) return "1 month";
  return `${d} days`;
}

export type { BusinessType };

/** Shape for creating campaign items from a selection (caller supplies ids). */
export function campaignItemInputsFromOutlines(
  outlines: PromoTemplateOutline[],
  ctx: { campaignId: string; companyId: string; keyMessage: string },
): Omit<CampaignItem, "id" | "createdAt" | "updatedAt">[] {
  return outlines.map((o) => {
    const parts = [
      o.caption,
      o.hashtags ? o.hashtags : "",
      o.cta ? `CTA: ${o.cta}` : "",
      `Angle: ${ctx.keyMessage}`,
    ].filter(Boolean);
    return {
      campaignId: ctx.campaignId,
      companyId: ctx.companyId,
      dayOffset: o.dayOffset,
      channel: o.channel,
      contentType: o.contentType,
      title: o.title,
      brief: parts.join("\n\n"),
      status: "planned" as const,
      contentId: null,
    };
  });
}
