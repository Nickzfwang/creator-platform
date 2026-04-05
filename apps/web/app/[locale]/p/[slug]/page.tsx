"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ExternalLink, Mail, Youtube, Instagram, Facebook, Twitter, ChevronDown, Play, Star, Quote } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

interface LandingPageData {
  id: string;
  title: string;
  headline: string | null;
  subheadline: string | null;
  bio: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  theme: string;
  colorScheme: { primary?: string; secondary?: string; bg?: string; text?: string } | null;
  socialLinks: Array<{ platform: string; url: string }> | null;
  ctaButtons: Array<{ label: string; url: string; style?: string }> | null;
  sections: Array<{ type: string; title?: string; content?: string; items?: any[] }> | null;
}

const platformIcons: Record<string, React.ReactNode> = {
  youtube: <Youtube className="h-5 w-5" />,
  instagram: <Instagram className="h-5 w-5" />,
  facebook: <Facebook className="h-5 w-5" />,
  twitter: <Twitter className="h-5 w-5" />,
  threads: <span className="text-lg">🧵</span>,
  tiktok: <span className="text-lg">🎵</span>,
  email: <Mail className="h-5 w-5" />,
};

// --- Block Template Components ---

function FaqBlock({ section, primaryColor }: { section: any; primaryColor: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const items = section.items ?? [];
  return (
    <div className="rounded-xl border p-6" style={{ borderColor: `${primaryColor}30` }}>
      {section.title && <h2 className="text-xl font-bold mb-4" style={{ color: primaryColor }}>{section.title}</h2>}
      <div className="space-y-2">
        {items.map((item: any, j: number) => {
          const question = item.question ?? item.title ?? item.text ?? String(item);
          const answer = item.answer ?? item.content ?? item.description ?? "";
          const isOpen = openIndex === j;
          return (
            <div key={j} className="rounded-lg border" style={{ borderColor: `${primaryColor}20` }}>
              <button
                className="w-full flex items-center justify-between p-4 text-left text-sm font-medium"
                onClick={() => setOpenIndex(isOpen ? null : j)}
              >
                <span>{question}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} style={{ color: primaryColor }} />
              </button>
              {isOpen && answer && (
                <div className="px-4 pb-4 text-sm opacity-70 leading-relaxed">{answer}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PricingBlock({ section, primaryColor, recommendedLabel, defaultButtonLabel }: { section: any; primaryColor: string; recommendedLabel: string; defaultButtonLabel: string }) {
  const items = section.items ?? [];
  return (
    <div className="rounded-xl border p-6" style={{ borderColor: `${primaryColor}30` }}>
      {section.title && <h2 className="text-xl font-bold mb-4 text-center" style={{ color: primaryColor }}>{section.title}</h2>}
      {section.content && <p className="text-sm text-center opacity-70 mb-6">{section.content}</p>}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item: any, j: number) => (
          <div key={j} className="rounded-lg border p-5 text-center relative" style={{ borderColor: item.recommended ? primaryColor : `${primaryColor}30` }}>
            {item.recommended && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-xs font-bold text-white" style={{ backgroundColor: primaryColor }}>
                {recommendedLabel}
              </div>
            )}
            <h3 className="text-lg font-bold">{item.name ?? item.title}</h3>
            {item.price !== undefined && (
              <div className="mt-2">
                <span className="text-3xl font-bold" style={{ color: primaryColor }}>${item.price}</span>
                {item.period && <span className="text-sm opacity-60">/{item.period}</span>}
              </div>
            )}
            {item.description && <p className="mt-2 text-sm opacity-60">{item.description}</p>}
            {item.features && (
              <ul className="mt-4 space-y-2 text-left">
                {item.features.map((f: string, k: number) => (
                  <li key={k} className="flex items-start gap-2 text-sm">
                    <span style={{ color: primaryColor }}>✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            )}
            {item.url && (
              <a href={item.url} target="_blank" rel="noopener noreferrer"
                className="mt-4 block rounded-lg py-2 px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: primaryColor }}>
                {item.buttonLabel ?? defaultButtonLabel}
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function VideoBlock({ section, primaryColor, watchVideoLabel }: { section: any; primaryColor: string; watchVideoLabel: string }) {
  const items = section.items ?? [];
  const singleUrl = section.content ?? items[0]?.url;

  function getEmbedUrl(url: string): string | null {
    try {
      const u = new URL(url);
      if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) {
        const videoId = u.hostname.includes("youtu.be") ? u.pathname.slice(1) : u.searchParams.get("v");
        return videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : null;
      }
      return null;
    } catch { return null; }
  }

  const videos = singleUrl ? [{ url: singleUrl, title: section.title }] : items;

  return (
    <div className="rounded-xl border p-6" style={{ borderColor: `${primaryColor}30` }}>
      {section.title && <h2 className="text-xl font-bold mb-4" style={{ color: primaryColor }}>{section.title}</h2>}
      <div className="space-y-4">
        {videos.map((v: any, j: number) => {
          const embedUrl = getEmbedUrl(v.url ?? "");
          if (embedUrl) {
            return (
              <div key={j} className="aspect-video rounded-lg overflow-hidden">
                <iframe src={embedUrl} className="h-full w-full" allowFullScreen title={v.title ?? `Video ${j + 1}`} />
              </div>
            );
          }
          return (
            <a key={j} href={v.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-gray-50"
              style={{ borderColor: `${primaryColor}20` }}>
              <Play className="h-8 w-8 shrink-0" style={{ color: primaryColor }} />
              <div>
                <div className="font-medium">{v.title ?? watchVideoLabel}</div>
                {v.description && <div className="text-sm opacity-60">{v.description}</div>}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function TestimonialsBlock({ section, primaryColor }: { section: any; primaryColor: string }) {
  const items = section.items ?? [];
  return (
    <div className="rounded-xl border p-6" style={{ borderColor: `${primaryColor}30` }}>
      {section.title && <h2 className="text-xl font-bold mb-4" style={{ color: primaryColor }}>{section.title}</h2>}
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item: any, j: number) => (
          <div key={j} className="rounded-lg p-4" style={{ backgroundColor: `${primaryColor}08` }}>
            <Quote className="h-5 w-5 mb-2 opacity-30" style={{ color: primaryColor }} />
            <p className="text-sm leading-relaxed italic opacity-80">{item.quote ?? item.text ?? item.content}</p>
            <div className="mt-3 flex items-center gap-2">
              {item.avatar && <img src={item.avatar} className="h-8 w-8 rounded-full" alt="" />}
              <div>
                <div className="text-sm font-medium">{item.name ?? item.author}</div>
                {item.role && <div className="text-xs opacity-50">{item.role}</div>}
              </div>
              {item.rating && (
                <div className="ml-auto flex gap-0.5">
                  {Array.from({ length: item.rating }).map((_, k) => (
                    <Star key={k} className="h-3 w-3 fill-current" style={{ color: "#f59e0b" }} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SocialGridBlock({ section, primaryColor, followersLabel }: { section: any; primaryColor: string; followersLabel: string }) {
  const items = section.items ?? [];
  return (
    <div className="rounded-xl border p-6" style={{ borderColor: `${primaryColor}30` }}>
      {section.title && <h2 className="text-xl font-bold mb-4" style={{ color: primaryColor }}>{section.title}</h2>}
      {section.content && <p className="text-sm opacity-70 mb-4">{section.content}</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {items.map((item: any, j: number) => (
          <a key={j} href={item.url ?? "#"} target="_blank" rel="noopener noreferrer"
            className="flex flex-col items-center gap-2 rounded-lg border p-4 transition-all hover:shadow-md hover:scale-[1.02]"
            style={{ borderColor: `${primaryColor}20` }}>
            <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}>
              {platformIcons[(item.platform ?? "").toLowerCase()] ?? <ExternalLink className="h-5 w-5" />}
            </div>
            <span className="text-sm font-medium">{item.label ?? item.platform ?? item.title}</span>
            {item.followers && <span className="text-xs opacity-50">{item.followers} {followersLabel}</span>}
          </a>
        ))}
      </div>
    </div>
  );
}

function DefaultBlock({ section, primaryColor }: { section: any; primaryColor: string }) {
  return (
    <div className="rounded-xl border p-6" style={{ borderColor: `${primaryColor}30` }}>
      {section.title && (
        <h2 className="text-xl font-bold mb-3" style={{ color: primaryColor }}>{section.title}</h2>
      )}
      {section.content && (
        <p className="text-sm leading-relaxed opacity-80">{section.content}</p>
      )}
      {section.items && section.items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {section.items.map((item: any, j: number) => (
            <li key={j} className="flex items-start gap-2 text-sm">
              <span style={{ color: primaryColor }}>✦</span>
              <span>{typeof item === "string" ? item : item.text || item.title || JSON.stringify(item)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SectionRenderer({ section, primaryColor, recommendedLabel, defaultButtonLabel, watchVideoLabel, followersLabel }: { section: any; primaryColor: string; recommendedLabel: string; defaultButtonLabel: string; watchVideoLabel: string; followersLabel: string }) {
  switch (section.type) {
    case "faq": return <FaqBlock section={section} primaryColor={primaryColor} />;
    case "pricing": return <PricingBlock section={section} primaryColor={primaryColor} recommendedLabel={recommendedLabel} defaultButtonLabel={defaultButtonLabel} />;
    case "video": return <VideoBlock section={section} primaryColor={primaryColor} watchVideoLabel={watchVideoLabel} />;
    case "testimonials": return <TestimonialsBlock section={section} primaryColor={primaryColor} />;
    case "social-grid": return <SocialGridBlock section={section} primaryColor={primaryColor} followersLabel={followersLabel} />;
    default: return <DefaultBlock section={section} primaryColor={primaryColor} />;
  }
}

export default function PublicLandingPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const t = useTranslations("publicLanding");
  const [page, setPage] = useState<LandingPageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    fetch(`${API_BASE}/v1/landing-page/p/${slug}`)
      .then((res) => {
        if (!res.ok) throw new Error("Page not found");
        return res.json();
      })
      .then(setPage)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
        <h1 className="text-2xl font-bold text-gray-900">{t("notFoundTitle")}</h1>
        <p className="mt-2 text-gray-500">{t("notFoundDescription")}</p>
      </div>
    );
  }

  const colors = page.colorScheme ?? {};
  const primaryColor = colors.primary || "#7c3aed";
  const bgColor = colors.bg || "#ffffff";
  const textColor = colors.text || "#1e293b";
  const socialLinks = Array.isArray(page.socialLinks) ? page.socialLinks : [];
  const ctaButtons = Array.isArray(page.ctaButtons) ? page.ctaButtons : [];
  const sections = Array.isArray(page.sections) ? page.sections : [];

  return (
    <div style={{ backgroundColor: bgColor, color: textColor }} className="min-h-screen">
      {/* Cover */}
      <div
        className="relative h-48 md:h-64"
        style={{
          background: page.coverUrl
            ? `url(${page.coverUrl}) center/cover`
            : `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)`,
        }}
      >
        <div className="absolute inset-0 bg-black/20" />
      </div>

      {/* Profile Section */}
      <div className="mx-auto max-w-2xl px-4 -mt-16 relative z-10">
        {/* Avatar */}
        <div className="flex justify-center">
          <div
            className="h-32 w-32 rounded-full border-4 border-white shadow-lg flex items-center justify-center text-4xl font-bold text-white"
            style={{
              background: page.avatarUrl
                ? `url(${page.avatarUrl}) center/cover`
                : `linear-gradient(135deg, ${primaryColor}, ${primaryColor}aa)`,
            }}
          >
            {!page.avatarUrl && page.title?.charAt(0)}
          </div>
        </div>

        {/* Info */}
        <div className="mt-4 text-center">
          <h1 className="text-3xl font-bold">{page.headline || page.title}</h1>
          {page.subheadline && (
            <p className="mt-2 text-lg opacity-80">{page.subheadline}</p>
          )}
          {page.bio && (
            <p className="mt-4 text-sm leading-relaxed opacity-70 max-w-lg mx-auto">{page.bio}</p>
          )}
        </div>

        {/* Social Links */}
        {socialLinks.length > 0 && (
          <div className="mt-6 flex justify-center gap-3">
            {socialLinks.map((link, i) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-full transition-transform hover:scale-110"
                style={{ backgroundColor: `${primaryColor}20`, color: primaryColor }}
              >
                {platformIcons[link.platform.toLowerCase()] || <ExternalLink className="h-5 w-5" />}
              </a>
            ))}
          </div>
        )}

        {/* CTA Buttons */}
        {ctaButtons.length > 0 && (
          <div className="mt-6 flex flex-col items-center gap-3">
            {ctaButtons.map((btn, i) => (
              <a
                key={i}
                href={btn.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full max-w-sm rounded-xl py-3 px-6 text-center font-semibold text-white transition-all hover:shadow-lg hover:scale-[1.02]"
                style={{
                  backgroundColor: i === 0 ? primaryColor : "transparent",
                  border: i === 0 ? "none" : `2px solid ${primaryColor}`,
                  color: i === 0 ? "#ffffff" : primaryColor,
                }}
              >
                {btn.label}
              </a>
            ))}
          </div>
        )}

        {/* Sections -- rendered by type-specific block templates */}
        {sections.length > 0 && (
          <div className="mt-10 space-y-8 pb-16">
            {sections.map((section, i) => (
              <SectionRenderer
                key={i}
                section={section}
                primaryColor={primaryColor}
                recommendedLabel={t("recommended")}
                defaultButtonLabel={t("selectPlan")}
                watchVideoLabel={t("watchVideo")}
                followersLabel={t("followers")}
              />
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="py-8 text-center text-xs opacity-50">
          Powered by Creator Platform
        </div>
      </div>
    </div>
  );
}
