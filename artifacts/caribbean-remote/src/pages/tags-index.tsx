import { useEffect } from "react";
import { Link } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { useListJobTags } from "@workspace/api-client-react";
import { Tag, ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const PAGE_TITLE = "Browse Remote Jobs by Skill Tag";
const META_DESCRIPTION =
  "Explore all skill tags used across remote job listings on CaribbeanRemote. Click any tag to see matching remote jobs.";

export default function TagsIndex() {
  const { data: tags, isLoading } = useListJobTags({ query: { staleTime: 60_000 } });

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
        {isLoading ? (
          <div className="flex flex-wrap gap-3">
            {Array.from({ length: 30 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-24 rounded-full" />
            ))}
          </div>
        ) : tags && tags.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {tags.map(({ tag, count }) => (
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
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            No tags found yet. Check back once jobs have been posted.
          </div>
        )}
      </div>
    </PageLayout>
  );
}
