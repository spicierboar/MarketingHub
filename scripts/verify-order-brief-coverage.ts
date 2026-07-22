/**
 * Verify every catalogue SKU resolves a required contentTopic (and education
 * outlines get learning fields). Run: npx tsx scripts/verify-order-brief-coverage.ts
 */
import { CLIENT_ORDER_MENU } from "../src/lib/client-order-catalogue-data";
import { resolveOrderBriefSchema } from "../src/lib/client-order-brief";

let missingTopic = 0;
let educationWithoutOutcomes = 0;
const samples: string[] = [];

for (const sku of CLIENT_ORDER_MENU) {
  const schema = resolveOrderBriefSchema(sku);
  const topic = schema.fields.find((f) => f.id === "contentTopic");
  if (!topic?.required) {
    missingTopic++;
    samples.push(`NO TOPIC: ${sku.id}`);
  }
  const hay = `${sku.id} ${sku.title}`.toLowerCase();
  if (
    /course_outline|lesson_plan|workshop_outline|seminar_outline/.test(hay)
  ) {
    const outcomes = schema.fields.find((f) => f.id === "keyOutcomes");
    const level = schema.fields.find((f) => f.id === "learningLevel");
    if (!outcomes?.required || !level?.required) {
      educationWithoutOutcomes++;
      samples.push(`WEAK EDUCATION: ${sku.id}`);
    }
  }
}

console.log(
  JSON.stringify(
    {
      skus: CLIENT_ORDER_MENU.length,
      missingTopic,
      educationWithoutOutcomes,
      samples: samples.slice(0, 20),
      courseOutlineFields: resolveOrderBriefSchema(
        CLIENT_ORDER_MENU.find((s) => s.id === "course_outline")!,
      ).fields.map((f) => `${f.id}${f.required ? "*" : ""}`),
      printSampleFields: resolveOrderBriefSchema(
        CLIENT_ORDER_MENU.find((s) => s.categoryId === "print")!,
      ).fields.map((f) => `${f.id}${f.required ? "*" : ""}`),
      jobAdFields: resolveOrderBriefSchema(
        CLIENT_ORDER_MENU.find((s) => s.id === "job_advertisement")!,
      ).fields.map((f) => `${f.id}${f.required ? "*" : ""}`),
    },
    null,
    2,
  ),
);

if (missingTopic || educationWithoutOutcomes) {
  process.exit(1);
}
