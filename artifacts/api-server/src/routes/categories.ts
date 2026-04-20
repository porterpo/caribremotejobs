import { Router, type IRouter } from "express";
import { eq, count, and } from "drizzle-orm";
import { db, jobsTable } from "@workspace/db";

const router: IRouter = Router();

const CATEGORIES: Array<{ slug: string; label: string; icon: string }> = [
  { slug: "technology", label: "Technology", icon: "💻" },
  { slug: "marketing", label: "Marketing", icon: "📣" },
  { slug: "finance", label: "Finance", icon: "💰" },
  { slug: "design", label: "Design", icon: "🎨" },
  { slug: "customer-support", label: "Customer Support", icon: "🤝" },
  { slug: "sales", label: "Sales", icon: "📈" },
  { slug: "operations", label: "Operations", icon: "⚙️" },
  { slug: "hr", label: "Human Resources", icon: "👥" },
  { slug: "writing", label: "Writing & Content", icon: "✍️" },
  { slug: "legal", label: "Legal", icon: "⚖️" },
  { slug: "education", label: "Education", icon: "📚" },
  { slug: "healthcare", label: "Healthcare", icon: "🏥" },
  { slug: "other", label: "Other", icon: "🌐" },
];

router.get("/categories", async (_req, res): Promise<void> => {
  const counts = await db
    .select({
      category: jobsTable.category,
      count: count(),
    })
    .from(jobsTable)
    .where(eq(jobsTable.approved, true))
    .groupBy(jobsTable.category);

  const countMap = new Map(counts.map((c) => [c.category, c.count]));

  const categories = CATEGORIES.map((cat) => ({
    slug: cat.slug,
    label: cat.label,
    icon: cat.icon,
    count: countMap.get(cat.slug) ?? 0,
  })).filter((cat) => cat.count > 0);

  // Add any categories in DB not in the predefined list
  for (const [slug, jobCount] of countMap.entries()) {
    if (!CATEGORIES.find((c) => c.slug === slug)) {
      categories.push({ slug, label: slug, icon: null as unknown as string, count: jobCount });
    }
  }

  res.json(categories);
});

export default router;
