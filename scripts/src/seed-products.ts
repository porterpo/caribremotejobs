import { getUncachableStripeClient } from "./stripeClient";

const PRODUCTS = [
  {
    name: "Single Job Post",
    description: "Post one job listing on CaribbeanRemote. Reviewed within 24 hours.",
    metadata: { type: "single" },
    price: 4900,
    recurring: false,
  },
  {
    name: "3-Pack Job Posts",
    description: "Post up to 3 job listings. Great for companies with multiple openings.",
    metadata: { type: "pack" },
    price: 12900,
    recurring: false,
  },
  {
    name: "Monthly Unlimited",
    description: "Unlimited job postings every month. Best for high-volume hiring.",
    metadata: { type: "monthly" },
    price: 29900,
    recurring: true,
  },
  {
    name: "Featured Upgrade",
    description: "Feature one existing or new job listing at the top of the board for 30 days.",
    metadata: { type: "featured" },
    price: 9900,
    recurring: false,
  },
  {
    name: "Caribbean Friendly Certification",
    description: "Get certified as a Caribbean Friendly employer. Your company and job listings will display an official badge showing your commitment to hiring Caribbean talent.",
    metadata: { type: "certification" },
    price: 19900,
    recurring: true,
    recurringInterval: "year" as const,
  },
];

async function seedProducts() {
  const stripe = await getUncachableStripeClient();
  console.log("Seeding Stripe products...");

  for (const product of PRODUCTS) {
    const existing = await stripe.products.search({
      query: `name:'${product.name}' AND active:'true'`,
    });

    if (existing.data.length > 0) {
      console.log(`✓ Already exists: ${product.name} (${existing.data[0].id})`);
      continue;
    }

    const created = await stripe.products.create({
      name: product.name,
      description: product.description,
      metadata: product.metadata,
    });

    const price = await stripe.prices.create({
      product: created.id,
      unit_amount: product.price,
      currency: "usd",
      ...(product.recurring
        ? { recurring: { interval: (product as { recurringInterval?: string }).recurringInterval ?? "month" } }
        : {}),
    });

    console.log(
      `✓ Created: ${created.name} ($${product.price / 100}${product.recurring ? "/mo" : ""}) — product ${created.id}, price ${price.id}`,
    );
  }

  console.log("Done!");
}

seedProducts().catch((err) => {
  console.error(err);
  process.exit(1);
});
