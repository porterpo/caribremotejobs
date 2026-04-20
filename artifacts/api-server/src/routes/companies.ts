import { Router, type IRouter } from "express";
import { eq, and, count, desc } from "drizzle-orm";
import { db, companiesTable, jobsTable } from "@workspace/db";
import {
  ListCompaniesQueryParams,
  CreateCompanyBody,
  GetCompanyParams,
  UpdateCompanyParams,
  UpdateCompanyBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/companies", async (req, res): Promise<void> => {
  const parsed = ListCompaniesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const conditions = [];
  if (parsed.data.caribbeanFriendly !== undefined) {
    conditions.push(eq(companiesTable.caribbeanFriendly, parsed.data.caribbeanFriendly));
  }

  const companies = await db
    .select({
      id: companiesTable.id,
      name: companiesTable.name,
      logo: companiesTable.logo,
      website: companiesTable.website,
      description: companiesTable.description,
      caribbeanFriendly: companiesTable.caribbeanFriendly,
      caribbeanFriendlyCertified: companiesTable.caribbeanFriendlyCertified,
      certificationExpiresAt: companiesTable.certificationExpiresAt,
      hiresBahamas: companiesTable.hiresBahamas,
      hiresCaribbean: companiesTable.hiresCaribbean,
      country: companiesTable.country,
      createdAt: companiesTable.createdAt,
      jobCount: count(jobsTable.id),
    })
    .from(companiesTable)
    .leftJoin(jobsTable, and(eq(jobsTable.companyId, companiesTable.id), eq(jobsTable.approved, true)))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(companiesTable.id)
    .orderBy(desc(companiesTable.caribbeanFriendly), companiesTable.name);

  res.json(companies);
});

router.post("/companies", async (req, res): Promise<void> => {
  const parsed = CreateCompanyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [company] = await db
    .insert(companiesTable)
    .values({
      ...parsed.data,
      caribbeanFriendly: parsed.data.caribbeanFriendly ?? false,
      hiresBahamas: parsed.data.hiresBahamas ?? false,
      hiresCaribbean: parsed.data.hiresCaribbean ?? false,
    })
    .returning();

  res.status(201).json({ ...company, jobCount: 0 });
});

router.get("/companies/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetCompanyParams.safeParse({ id: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [result] = await db
    .select({
      id: companiesTable.id,
      name: companiesTable.name,
      logo: companiesTable.logo,
      website: companiesTable.website,
      description: companiesTable.description,
      caribbeanFriendly: companiesTable.caribbeanFriendly,
      caribbeanFriendlyCertified: companiesTable.caribbeanFriendlyCertified,
      certificationExpiresAt: companiesTable.certificationExpiresAt,
      hiresBahamas: companiesTable.hiresBahamas,
      hiresCaribbean: companiesTable.hiresCaribbean,
      country: companiesTable.country,
      createdAt: companiesTable.createdAt,
      jobCount: count(jobsTable.id),
    })
    .from(companiesTable)
    .leftJoin(jobsTable, and(eq(jobsTable.companyId, companiesTable.id), eq(jobsTable.approved, true)))
    .where(eq(companiesTable.id, params.data.id))
    .groupBy(companiesTable.id);

  if (!result) {
    res.status(404).json({ error: "Company not found" });
    return;
  }

  res.json(result);
});

router.patch("/companies/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateCompanyParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateCompanyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [company] = await db
    .update(companiesTable)
    .set(parsed.data)
    .where(eq(companiesTable.id, params.data.id))
    .returning();

  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }

  res.json({ ...company, jobCount: 0 });
});

export default router;
