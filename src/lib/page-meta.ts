/** Consistent social metadata, with a distinct title and description per screen. */
export function pageMeta(title: string, description: string) {
  return { meta: [
    { title: `${title} — Debt Free Buddy` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} — Debt Free Buddy` },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] };
}