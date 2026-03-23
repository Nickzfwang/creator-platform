"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ExternalLink, Mail, Youtube, Instagram, Facebook, Twitter } from "lucide-react";

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

export default function PublicLandingPage() {
  const params = useParams();
  const slug = params?.slug as string;
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
        <h1 className="text-2xl font-bold text-gray-900">找不到此頁面</h1>
        <p className="mt-2 text-gray-500">此 Landing Page 不存在或尚未發布</p>
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

        {/* Sections */}
        {sections.length > 0 && (
          <div className="mt-10 space-y-8 pb-16">
            {sections.map((section, i) => (
              <div key={i} className="rounded-xl border p-6" style={{ borderColor: `${primaryColor}30` }}>
                {section.title && (
                  <h2 className="text-xl font-bold mb-3" style={{ color: primaryColor }}>
                    {section.title}
                  </h2>
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
