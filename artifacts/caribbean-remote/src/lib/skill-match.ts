export interface SkillMatchResult {
  matched: number;
  total: number;
  percentage: number;
  matchedSkills: string[];
}

const LANG_SUFFIXES = /\.(js|ts|jsx|tsx|net|py|rb|go|rs|java|php|cpp|cs|vue|swift|kt)$/i;

function normalize(s: string): string {
  return s
    .trim()
    .replace(LANG_SUFFIXES, "")
    .toLowerCase()
    .replace(/[\s\-_.]/g, "");
}

function skillsMatch(resumeSkill: string, jobTag: string): boolean {
  const a = normalize(resumeSkill);
  const b = normalize(jobTag);
  if (!a || !b) return false;
  return a === b;
}

export function computeSkillMatch(
  resumeSkills: string[],
  jobTagsString: string | null | undefined,
): SkillMatchResult | null {
  if (!resumeSkills || resumeSkills.length === 0) return null;
  if (!jobTagsString || !jobTagsString.trim()) return null;

  const jobTags = jobTagsString
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  if (jobTags.length === 0) return null;

  const matchedSkills: string[] = [];

  for (const tag of jobTags) {
    const hasMatch = resumeSkills.some((skill) => skillsMatch(skill, tag));
    if (hasMatch) {
      matchedSkills.push(tag);
    }
  }

  return {
    matched: matchedSkills.length,
    total: jobTags.length,
    percentage: Math.round((matchedSkills.length / jobTags.length) * 100),
    matchedSkills,
  };
}
