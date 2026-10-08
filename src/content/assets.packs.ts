/**
 * SPRACHPAKET-BUILD (08.10.2026): Mit `THAISPEAKER_MEDIA=packs` löst Metro
 * `content/assets` auf DIESE Datei auf (metro.config.js). Dieselbe API wie
 * `assets.ts`, aber leer: Hörclips und Bilder kommen dann ausschließlich aus
 * den heruntergeladenen Sprachpaketen (`lib/packs`). Der Katalog bleibt
 * eingebettet. Die App erkennt die leere Liste (`mediaFromPacks`) und
 * bietet den Download an.
 */
export const CONTENT_ASSETS: Record<string, number> = {};
