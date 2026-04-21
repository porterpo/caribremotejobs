import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/PageLayout";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, X, Download, FileText } from "lucide-react";

const BASE = import.meta.env.BASE_URL;

function uuid() {
  return crypto.randomUUID();
}

interface ExperienceEntry {
  id: string;
  title: string;
  company: string;
  startDate: string;
  endDate: string | null;
  description: string;
}

interface EducationEntry {
  id: string;
  degree: string;
  institution: string;
  graduationYear: string;
}

interface ResumeData {
  id: number;
  clerkUserId: string;
  summary: string | null;
  experience: ExperienceEntry[] | null;
  education: EducationEntry[] | null;
  skills: string[] | null;
  updatedAt: string;
}

interface FormState {
  summary: string;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  skills: string[];
}

const emptyForm: FormState = {
  summary: "",
  experience: [],
  education: [],
  skills: [],
};

function SkillTag({ skill, onRemove }: { skill: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-sm px-3 py-1 rounded-full font-medium">
      {skill}
      <button type="button" onClick={onRemove} className="hover:text-destructive ml-1">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function ExperienceSection({
  entries,
  onChange,
}: {
  entries: ExperienceEntry[];
  onChange: (entries: ExperienceEntry[]) => void;
}) {
  const update = (id: string, field: keyof ExperienceEntry, value: string | null) => {
    onChange(entries.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  };

  return (
    <div className="space-y-4">
      {entries.map((entry, i) => (
        <div key={entry.id} className="border rounded-lg p-4 space-y-3 bg-card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-muted-foreground">
              Position {i + 1}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive h-7"
              onClick={() => onChange(entries.filter((e) => e.id !== entry.id))}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Remove
            </Button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Job Title</Label>
              <Input
                placeholder="Senior Software Engineer"
                value={entry.title}
                onChange={(e) => update(entry.id, "title", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Company</Label>
              <Input
                placeholder="Acme Corp"
                value={entry.company}
                onChange={(e) => update(entry.id, "company", e.target.value)}
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Start Date</Label>
              <Input
                placeholder="Jan 2022"
                value={entry.startDate}
                onChange={(e) => update(entry.id, "startDate", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">End Date (leave blank for Present)</Label>
              <Input
                placeholder="Present"
                value={entry.endDate ?? ""}
                onChange={(e) =>
                  update(entry.id, "endDate", e.target.value || null)
                }
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Key Responsibilities / Achievements</Label>
            <Textarea
              placeholder="- Led migration of legacy monolith to microservices&#10;- Reduced API latency by 40% through query optimisation"
              rows={3}
              value={entry.description}
              onChange={(e) => update(entry.id, "description", e.target.value)}
            />
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange([
            ...entries,
            { id: uuid(), title: "", company: "", startDate: "", endDate: null, description: "" },
          ])
        }
      >
        <Plus className="h-4 w-4 mr-1" /> Add Position
      </Button>
    </div>
  );
}

function EducationSection({
  entries,
  onChange,
}: {
  entries: EducationEntry[];
  onChange: (entries: EducationEntry[]) => void;
}) {
  const update = (id: string, field: keyof EducationEntry, value: string) => {
    onChange(entries.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  };

  return (
    <div className="space-y-4">
      {entries.map((entry, i) => (
        <div key={entry.id} className="border rounded-lg p-4 space-y-3 bg-card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-muted-foreground">
              Education {i + 1}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive h-7"
              onClick={() => onChange(entries.filter((e) => e.id !== entry.id))}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Remove
            </Button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Degree / Qualification</Label>
              <Input
                placeholder="BSc Computer Science"
                value={entry.degree}
                onChange={(e) => update(entry.id, "degree", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Institution</Label>
              <Input
                placeholder="University of the West Indies"
                value={entry.institution}
                onChange={(e) => update(entry.id, "institution", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1 max-w-[200px]">
            <Label className="text-xs">Graduation Year</Label>
            <Input
              placeholder="2020"
              value={entry.graduationYear}
              onChange={(e) => update(entry.id, "graduationYear", e.target.value)}
            />
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange([...entries, { id: uuid(), degree: "", institution: "", graduationYear: "" }])
        }
      >
        <Plus className="h-4 w-4 mr-1" /> Add Education
      </Button>
    </div>
  );
}

function ResumePreview({ form, displayName }: { form: FormState; displayName: string }) {
  const hasContent =
    form.summary ||
    form.experience.length > 0 ||
    form.education.length > 0 ||
    form.skills.length > 0;

  if (!hasContent) return null;

  return (
    <div id="resume-print-region" className="border rounded-xl p-8 bg-white space-y-6 text-sm">
      <div className="border-b pb-4">
        <h2 className="text-2xl font-bold text-foreground">{displayName}</h2>
        <p className="text-xs text-muted-foreground mt-1">CaribbeanRemote Profile</p>
      </div>

      {form.summary && (
        <section>
          <h3 className="font-semibold text-base mb-2 text-primary">Professional Summary</h3>
          <p className="text-muted-foreground leading-relaxed">{form.summary}</p>
        </section>
      )}

      {form.experience.length > 0 && (
        <section>
          <h3 className="font-semibold text-base mb-3 text-primary">Work Experience</h3>
          <div className="space-y-4">
            {form.experience.map((exp) => (
              <div key={exp.id}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">{exp.title || "—"}</p>
                    <p className="text-muted-foreground">{exp.company || "—"}</p>
                  </div>
                  <p className="text-muted-foreground text-xs shrink-0 ml-4">
                    {exp.startDate} – {exp.endDate ?? "Present"}
                  </p>
                </div>
                {exp.description && (
                  <div className="mt-1 text-muted-foreground whitespace-pre-line">
                    {exp.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {form.education.length > 0 && (
        <section>
          <h3 className="font-semibold text-base mb-3 text-primary">Education</h3>
          <div className="space-y-3">
            {form.education.map((edu) => (
              <div key={edu.id} className="flex justify-between">
                <div>
                  <p className="font-semibold">{edu.degree || "—"}</p>
                  <p className="text-muted-foreground">{edu.institution || "—"}</p>
                </div>
                {edu.graduationYear && (
                  <p className="text-muted-foreground text-xs">{edu.graduationYear}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {form.skills.length > 0 && (
        <section>
          <h3 className="font-semibold text-base mb-2 text-primary">Skills</h3>
          <div className="flex flex-wrap gap-2">
            {form.skills.map((s) => (
              <span key={s} className="bg-muted px-2 py-0.5 rounded text-xs font-medium">
                {s}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function ResumePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [skillInput, setSkillInput] = useState("");
  const skillInputRef = useRef<HTMLInputElement>(null);

  const { data: resume, status } = useQuery<ResumeData | null>({
    queryKey: ["resume", "me"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/resume/me`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch resume");
      return res.json() as Promise<ResumeData>;
    },
    staleTime: 30_000,
    retry: false,
  });

  useEffect(() => {
    if (resume) {
      setForm({
        summary: resume.summary ?? "",
        experience: (resume.experience ?? []).map((e) => ({ ...e, id: e.id ?? uuid() })),
        education: (resume.education ?? []).map((e) => ({ ...e, id: e.id ?? uuid() })),
        skills: resume.skills ?? [],
      });
    }
  }, [resume]);

  const saveMutation = useMutation({
    mutationFn: async (data: FormState) => {
      const isNew = resume === null;
      const res = await fetch(`${BASE}api/resume`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to save resume");
      }
      return res.json() as Promise<ResumeData>;
    },
    onSuccess: (saved) => {
      const hadSkillsBefore = (resume?.skills ?? []).length > 0;
      const hasSkillsNow = (saved.skills ?? []).length > 0;
      if (hasSkillsNow && !hadSkillsBefore) {
        track("skills_added", { skill_count: saved.skills!.length });
      } else if (hasSkillsNow && hadSkillsBefore) {
        track("skills_updated", { skill_count: saved.skills!.length });
      }
      queryClient.setQueryData(["resume", "me"], saved);
      toast({ title: "Resume saved", description: "Your resume has been updated." });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(form);
  };

  const addSkill = () => {
    const trimmed = skillInput.trim();
    if (!trimmed || form.skills.includes(trimmed)) return;
    setForm((prev) => ({ ...prev, skills: [...prev.skills, trimmed] }));
    setSkillInput("");
    skillInputRef.current?.focus();
  };

  const handleSkillKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSkill();
    }
  };

  const handleDownloadPdf = () => {
    window.print();
  };

  const isLoading = status === "pending";

  const displayName =
    (queryClient.getQueryData(["profile", "me"]) as { displayName?: string } | null)
      ?.displayName || "My Resume";

  return (
    <>
      <style>{`
        @media print {
          body { visibility: hidden; }
          #resume-print-region, #resume-print-region * { visibility: visible; }
          #resume-print-region {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            padding: 2rem;
          }
        }
      `}</style>

      <PageLayout>
        <div className="max-w-3xl mx-auto px-4 py-10 w-full">
          <div className="flex items-start justify-between mb-8 gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-1">My Resume</h1>
              <p className="text-muted-foreground">
                Build a structured resume that you can attach when applying to jobs.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleDownloadPdf}
              className="shrink-0"
              disabled={!form.summary && form.experience.length === 0 && form.education.length === 0 && form.skills.length === 0}
            >
              <Download className="h-4 w-4 mr-2" /> Download PDF
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-10">
              {/* Professional Summary */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-semibold">Professional Summary</h2>
                </div>
                <Textarea
                  placeholder="A brief overview of your professional background, core skills, and career goals…"
                  rows={4}
                  value={form.summary}
                  onChange={(e) => setForm((prev) => ({ ...prev, summary: e.target.value }))}
                />
              </section>

              {/* Work Experience */}
              <section className="space-y-3">
                <h2 className="text-xl font-semibold">Work Experience</h2>
                <ExperienceSection
                  entries={form.experience}
                  onChange={(experience) => setForm((prev) => ({ ...prev, experience }))}
                />
              </section>

              {/* Education */}
              <section className="space-y-3">
                <h2 className="text-xl font-semibold">Education</h2>
                <EducationSection
                  entries={form.education}
                  onChange={(education) => setForm((prev) => ({ ...prev, education }))}
                />
              </section>

              {/* Skills */}
              <section className="space-y-3">
                <h2 className="text-xl font-semibold">Skills</h2>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      ref={skillInputRef}
                      placeholder="Type a skill and press Enter (e.g. React, Python, Figma)"
                      value={skillInput}
                      onChange={(e) => setSkillInput(e.target.value)}
                      onKeyDown={handleSkillKeyDown}
                    />
                    <Button type="button" variant="outline" onClick={addSkill}>
                      Add
                    </Button>
                  </div>
                  {form.skills.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {form.skills.map((skill) => (
                        <SkillTag
                          key={skill}
                          skill={skill}
                          onRemove={() =>
                            setForm((prev) => ({
                              ...prev,
                              skills: prev.skills.filter((s) => s !== skill),
                            }))
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <div className="flex items-center gap-3 pt-2 border-t">
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving…" : "Save Resume"}
                </Button>
                <Button type="button" variant="ghost" asChild>
                  <Link href="/jobs">Cancel</Link>
                </Button>
              </div>
            </form>
          )}

          {/* Live Preview */}
          {!isLoading && (form.summary || form.experience.length > 0 || form.education.length > 0 || form.skills.length > 0) && (
            <div className="mt-12 pt-8 border-t">
              <h2 className="text-xl font-semibold mb-4">Preview</h2>
              <ResumePreview form={form} displayName={displayName} />
            </div>
          )}
        </div>
      </PageLayout>
    </>
  );
}
