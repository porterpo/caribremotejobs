import { useEffect, useState, useMemo } from "react";
import { Link } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { Tag, ArrowLeft, ArrowDownAZ, TrendingDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";

const PAGE_TITLE = "Browse Remote Jobs by Skill Tag";
const META_DESCRIPTION =
  "Explore all skill tags used across remote job listings on CaribbeanRemote. Click any tag to see matching remote jobs.";

const LS_KEY = "tagsSortOrder";

type SortOrder = "count" | "alpha";

const ALL_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function readStoredSort(): SortOrder {
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored === "alpha" || stored === "count") return stored;
  } catch {}
  return "count";
}

function scrollToLetter(letter: string) {
  const el = document.getElementById(`tag-letter-${letter}`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

export default function TagsIndex() {
  const { data: tags, isLoading } = useQuery({
    queryKey: ["job-tags"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/jobs/tags`);
      if (!res.ok) throw new Error("Failed to fetch tags");
      return res.json() as Promise<Array<{ tag: string; count: number }>>;
    },
    staleTime: 60_000,
  });
  const [sortOrder, setSortOrder] = useState<SortOrder>(readStoredSort);

  useEffect(() => {
    document.title = `${PAGE_TITLE} | CaribbeanRemote`;
    let metaEl = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!metaEl) {
      metaEl = document.createElement("meta");
      metaEl.name = "description";
      document.head.appendChild(metaEl);
    }
    metaEl.content = META_DESCRIPTION;
    return () => {
      document.title = "CaribbeanRemote";
    };
  }, []);

  const sortedTags = useMemo(() => {
    if (!tags) return [];
    if (sortOrder === "alpha") {
      return [...tags].sort((a, b) => a.tag.localeCompare(b.tag, undefined, { sensitivity: "base" }));
    }
    return tags;
  }, [tags, sortOrder]);

  const alphaGroups = useMemo(() => {
    if (sortOrder !== "alpha") return null;
    const groups: Record<string, typeof sortedTags> = {};
    for (const item of sortedTags) {
      const letter = item.tag[0].toUpperCase();
      const key = /^[A-Z]/.test(letter) ? letter : "#";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === "#") return 1;
      if (b === "#") return -1;
      return a.localeCompare(b);
    });
  }, [sortOrder, sortedTags]);

  const presentLetters = useMemo(() => {
    if (!alphaGroups) return new Set<string>();
    return new Set(alphaGroups.map(([letter]) => letter));
  }, [alphaGroups]);

  return (
    <PageLayout>
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-8 md:py-12">
          <Link
            href="/jobs"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            All Jobs
          </Link>
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Tag className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{PAGE_TITLE}</h1>
          </div>
          <p className="text-muted-foreground text-lg max-w-2xl">
            {isLoading
              ? "Loading tags…"
              : `${tags?.length ?? 0} skill ${(tags?.length ?? 0) === 1 ? "tag" : "tags"} found across all remote job listings.`}
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        {!isLoading && tags && tags.length > 0 && (
          <div className="flex items-center gap-2 mb-6">
            <span className="text-sm text-muted-foreground mr-1">Sort:</span>
            <Button
              variant={sortOrder === "count" ? "default" : "outline"}
              size="sm"
              onClick={() => { setSortOrder("count"); try { localStorage.setItem(LS_KEY, "count"); } catch {} }}
              className="gap-1.5"
            >
              <TrendingDown className="h-3.5 w-3.5" />
              Most Jobs
            </Button>
            <Button
              variant={sortOrder === "alpha" ? "default" : "outline"}
              size="sm"
              onClick={() => { setSortOrder("alpha"); try { localStorage.setItem(LS_KEY, "alpha"); } catch {} }}
              className="gap-1.5"
            >
              <ArrowDownAZ className="h-3.5 w-3.5" />
              A–Z
            </Button>
          </div>
        )}

        {sortOrder === "alpha" && !isLoading && alphaGroups && alphaGroups.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-8 p-3 bg-muted/40 rounded-lg border">
            {ALL_LETTERS.map((letter) => {
              const active = presentLetters.has(letter);
              return (
                <button
                  key={letter}
                  onClick={() => active && scrollToLetter(letter)}
                  disabled={!active}
                  aria-label={active ? `Jump to letter ${letter}` : `No tags for letter ${letter}`}
                  className={[
                    "w-7 h-7 rounded text-sm font-medium transition-colors",
                    active
                      ? "hover:bg-primary hover:text-primary-foreground cursor-pointer text-foreground"
                      : "text-muted-foreground/40 cursor-default",
                  ].join(" ")}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-wrap gap-3">
            {Array.from({ length: 30 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-24 rounded-full" />
            ))}
          </div>
        ) : tags && tags.length > 0 ? (
          sortOrder === "alpha" && alphaGroups ? (
            <div className="space-y-8">
              {alphaGroups.map(([letter, items]) => (
                <div key={letter} id={`tag-letter-${letter}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-lg font-bold text-primary w-7 shrink-0">{letter}</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {items.map(({ tag, count }) => (
                      <Link key={tag} href={`/jobs/tag/${encodeURIComponent(tag)}`}>
                        <Badge
                          variant="secondary"
                          className="cursor-pointer text-sm px-4 py-1.5 rounded-full hover:bg-primary hover:text-primary-foreground transition-colors"
                        >
                          {tag}
                          <span className="ml-2 text-xs opacity-70">{count}</span>
                        </Badge>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {sortedTags.map(({ tag, count }) => (
                <Link key={tag} href={`/jobs/tag/${encodeURIComponent(tag)}`}>
                  <Badge
                    variant="secondary"
                    className="cursor-pointer text-sm px-4 py-1.5 rounded-full hover:bg-primary hover:text-primary-foreground transition-colors"
                  >
                    {tag}
                    <span className="ml-2 text-xs opacity-70">{count}</span>
                  </Badge>
                </Link>
              ))}
            </div>
          )
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            No tags found yet. Check back once jobs have been posted.
          </div>
        )}
      </div>
    </PageLayout>
  );
}
