import { getClientMenuSku } from "../src/lib/client-order-menu";
import { validateContentRecipe } from "../src/lib/content-recipe";
import { getExtraOrderExplainer } from "../src/lib/client-order-explainer";
import { resolveOrderBriefSchema } from "../src/lib/client-order-brief";

for (const id of [
  "logo_design_pack",
  "animated_gif_pack",
  "short_ad_video",
  "short_movie_video",
  "animation_pack",
]) {
  const sku = getClientMenuSku(id);
  if (!sku) {
    console.log("MISSING", id);
    continue;
  }
  const v = validateContentRecipe({
    createFor: "client",
    contentType: sku.contentType,
    topic: "Test",
    subject: { kind: "client", companyId: "c1" },
    channels: [sku.primaryChannel],
    primaryChannel: sku.primaryChannel,
  });
  console.log(
    id,
    "ok=" + v.ok,
    (v.issues || []).map((i) => i.message).join("; ") || "—",
    "| required",
    resolveOrderBriefSchema(sku)
      .fields.filter((f) => f.required)
      .map((f) => f.id)
      .join(","),
  );
}
console.log(
  "logo about:",
  getExtraOrderExplainer(getClientMenuSku("logo_design_pack")!).about.slice(0, 120),
);
