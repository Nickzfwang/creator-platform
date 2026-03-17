// ─── Enums (mirrored from Prisma for frontend use) ───

export enum UserRole {
  CREATOR = 'CREATOR',
  ADMIN = 'ADMIN',
  AGENCY_MANAGER = 'AGENCY_MANAGER',
  FAN = 'FAN',
}

export enum SocialPlatform {
  YOUTUBE = 'YOUTUBE',
  INSTAGRAM = 'INSTAGRAM',
  TIKTOK = 'TIKTOK',
  FACEBOOK = 'FACEBOOK',
  TWITTER = 'TWITTER',
  THREADS = 'THREADS',
}

export enum VideoStatus {
  UPLOADING = 'UPLOADING',
  UPLOADED = 'UPLOADED',
  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
}

export enum ClipStatus {
  GENERATING = 'GENERATING',
  READY = 'READY',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export enum PostStatus {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  PUBLISHING = 'PUBLISHING',
  PUBLISHED = 'PUBLISHED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum SubscriptionPlan {
  FREE = 'FREE',
  STARTER = 'STARTER',
  PRO = 'PRO',
  BUSINESS = 'BUSINESS',
}

export enum DealStatus {
  DRAFT = 'DRAFT',
  PROPOSAL_SENT = 'PROPOSAL_SENT',
  NEGOTIATING = 'NEGOTIATING',
  CONFIRMED = 'CONFIRMED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

// ─── API Response Types ───

export interface ApiResponse<T> {
  data: T;
  meta?: PaginationMeta;
}

export interface ApiError {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
}

export interface PaginationMeta {
  cursor?: string;
  hasMore: boolean;
  total?: number;
}

export interface PaginationQuery {
  cursor?: string;
  limit?: number;
}

// ─── User ───

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: UserRole;
  locale: string;
  timezone?: string;
  onboardingCompleted: boolean;
}

// ─── Video ───

export interface VideoSummary {
  id: string;
  title: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  status: VideoStatus;
  clipCount: number;
  createdAt: string;
}

export interface VideoClipSummary {
  id: string;
  title: string;
  description?: string;
  startTime: number;
  endTime: number;
  durationSeconds?: number;
  aiScore?: number;
  thumbnailUrl?: string;
  hashtags: string[];
  status: ClipStatus;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

// ─── Post ───

export interface PostSummary {
  id: string;
  contentText?: string;
  platforms: PostPlatformInfo[];
  status: PostStatus;
  scheduledAt?: string;
  publishedAt?: string;
  createdAt: string;
}

export interface PostPlatformInfo {
  platform: SocialPlatform;
  accountId: string;
  platformPostId?: string;
  status: string;
}

// ─── Analytics ───

export interface DashboardStats {
  totalFollowers: number;
  totalViews: number;
  totalRevenue: number;
  engagementRate: number;
  followersGrowth: number;
  viewsGrowth: number;
}

export interface PlatformStat {
  platform: SocialPlatform;
  followers: number;
  views: number;
  engagement: number;
  date: string;
}

// ─── Bot ───

export interface BotMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

// ─── Subscription Plan Limits ───

export const PLAN_LIMITS: Record<SubscriptionPlan, {
  videosPerMonth: number;
  postsPerMonth: number;
  botMessagesPerMonth: number;
  brandDealsPerMonth: number;
}> = {
  [SubscriptionPlan.FREE]: {
    videosPerMonth: 3,
    postsPerMonth: 30,
    botMessagesPerMonth: 100,
    brandDealsPerMonth: 1,
  },
  [SubscriptionPlan.STARTER]: {
    videosPerMonth: 15,
    postsPerMonth: 150,
    botMessagesPerMonth: 1000,
    brandDealsPerMonth: 5,
  },
  [SubscriptionPlan.PRO]: {
    videosPerMonth: 50,
    postsPerMonth: 500,
    botMessagesPerMonth: 5000,
    brandDealsPerMonth: 20,
  },
  [SubscriptionPlan.BUSINESS]: {
    videosPerMonth: Infinity,
    postsPerMonth: Infinity,
    botMessagesPerMonth: Infinity,
    brandDealsPerMonth: Infinity,
  },
};
