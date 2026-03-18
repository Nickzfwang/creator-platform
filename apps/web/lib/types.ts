// Re-export shared types
export type {
  ApiResponse,
  UserProfile,
} from '@creator-platform/shared-types';

export {
  UserRole,
  SocialPlatform,
  VideoStatus,
  PostStatus,
  DealStatus,
} from '@creator-platform/shared-types';

// ─── Pagination ───

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PaginationParams {
  cursor?: string;
  limit?: number;
}

// ─── Video ───

export interface Video {
  id: string;
  title: string;
  description: string | null;
  originalUrl?: string | null;
  status: string;
  durationSeconds: number | null;
  fileSizeBytes?: number | null;
  thumbnailUrl: string | null;
  aiSummary?: string | null;
  _count?: { clips: number };
  createdAt: string;
  updatedAt: string;
}

export interface VideoClip {
  id: string;
  videoId?: string;
  title: string;
  startTime: number;
  endTime: number;
  durationSeconds?: number | null;
  clipUrl?: string | null;
  thumbnailUrl?: string | null;
  aiScore: number | null;
  hashtags?: string[];
  status: string;
  createdAt: string;
}

// ─── Post ───

export interface Post {
  id: string;
  contentText: string | null;
  platforms: Array<{ platform: string; config?: Record<string, unknown> }>;
  type: string;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  hashtags: string[];
  mediaUrls?: string[];
  clipId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PostListResponse {
  items: Post[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ─── Social ───

export interface SocialAccount {
  id: string;
  platform: string;
  platformUsername: string;
  platformUserId: string;
  isActive: boolean;
  followerCount: number | null;
  lastSyncAt: string | null;
  createdAt: string;
}

// ─── Membership ───

export interface MembershipTier {
  id: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number | null;
  benefits: string[];
  botAccessTier: string;
  maxMembers: number | null;
  isActive: boolean;
  sortOrder: number;
  memberCount: number;
  createdAt: string;
}

export interface Member {
  id: string;
  userId: string;
  tierId: string;
  status: string;
  user: {
    displayName: string;
    email: string;
    avatarUrl: string | null;
  };
  tier: {
    name: string;
  };
  createdAt: string;
}

// ─── Brand Deal ───

export interface BrandDeal {
  id: string;
  brandName: string;
  dealType: string;
  status: string;
  budgetRange: { min: number; max: number; currency: string } | null;
  deliverables: string[];
  timelineStart: string | null;
  timelineEnd: string | null;
  actualRevenue: number | null;
  notes: string | null;
  aiProposal: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineStats {
  pipeline: Record<string, number>;
  totalDeals: number;
  totalRevenue: number;
  activeDeals: number;
}

// ─── Analytics ───

export interface AnalyticsOverview {
  period: { start: string; end: string };
  metrics: {
    followers: number;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    engagementRate: number;
  };
  changes: {
    followers: number;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    engagementRate: number;
  };
  platformBreakdown: Record<string, {
    followers: number;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    engagementRate: number;
  }>;
}

export interface RevenueAnalytics {
  period: { start: string; end: string };
  source: string;
  subscription: number;
  membership: number;
  affiliate: number;
  total: number;
  breakdown: Array<{
    date: string;
    amount: number;
    source?: string;
  }>;
}

// Dashboard overview (separate from analytics)
export interface DashboardOverview {
  metrics: {
    totalFollowers: number;
    followersChange: number;
    followersChangePercent: number;
    totalViews: number;
    viewsChange: number;
    viewsChangePercent: number;
    totalRevenue: number;
    revenueChange: number;
    revenueChangePercent: number;
    avgEngagementRate: number;
    engagementRateChange: number;
  };
  trends: Array<{ date: string; followers: number; views: number; revenue: number }>;
  topContent: Array<{ title: string; platform: string; views: number; engagement: number }>;
  platformBreakdown: Array<{ platform: string; followers: number; views: number; engagement: number }>;
}

// ─── Tenant / Settings ───

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  logoUrl: string | null;
  customDomain: string | null;
  themeConfig: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface WebhookRecord {
  id: string;
  url: string;
  events: string[];
  description: string | null;
  isActive: boolean;
  createdAt: string;
}
