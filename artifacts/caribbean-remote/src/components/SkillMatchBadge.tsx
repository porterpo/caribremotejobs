import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { SkillMatchResult } from "@/lib/skill-match";

interface SkillMatchBadgeProps {
  match: SkillMatchResult;
  size?: "sm" | "md";
}

function badgeColor(percentage: number): string {
  if (percentage >= 70) return "bg-green-100 text-green-800 border-green-200";
  if (percentage >= 40) return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-muted text-muted-foreground border-border";
}

export function SkillMatchBadge({ match, size = "sm" }: SkillMatchBadgeProps) {
  const colorClass = badgeColor(match.percentage);
  const label =
    size === "md"
      ? `${match.percentage}% skill match (${match.matched} of ${match.total})`
      : `${match.percentage}% match`;

  const tooltipText =
    match.matched === 0
      ? `None of your skills match the ${match.total} required skill${match.total !== 1 ? "s" : ""}`
      : `You match ${match.matched} of ${match.total} required skill${match.total !== 1 ? "s" : ""}: ${match.matchedSkills.join(", ")}`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium cursor-default select-none ${
              size === "md" ? "text-xs" : "text-[11px]"
            } ${colorClass}`}
          >
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-center text-xs">
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
