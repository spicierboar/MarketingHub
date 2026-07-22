-- ContentRecipe jsonb on content_items (compose → cook contract).
-- Nullable; no backfill — legacy rows simply have no recipe.
-- @see docs/CONTENT-CREATE-TAXONOMY-DESIGN.md §9

alter table public.content_items
  add column if not exists recipe jsonb;

comment on column public.content_items.recipe is
  'Validated ContentRecipe (schemaVersion 1.1+) — compose axes + derived family for Engine cook.';

create index if not exists content_items_recipe_family_idx
  on public.content_items ((recipe->>'family'));

create index if not exists content_items_recipe_content_type_idx
  on public.content_items ((recipe->>'contentType'));

grant insert (recipe) on table public.content_items to anon, authenticated, service_role;
grant select (recipe) on table public.content_items to anon, authenticated, service_role;
grant update (recipe) on table public.content_items to anon, authenticated, service_role;
grant references (recipe) on table public.content_items to anon, authenticated, service_role;
