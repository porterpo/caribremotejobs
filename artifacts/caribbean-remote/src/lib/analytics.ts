type EventProperties = Record<string, string | number | boolean | null | undefined>;

export function track(event: string, properties?: EventProperties): void {
  if (typeof window === "undefined") return;

  const base = import.meta.env.BASE_URL as string;
  const url = `${base}api/analytics/track`;

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, ...properties }),
  }).catch(() => {});
}
