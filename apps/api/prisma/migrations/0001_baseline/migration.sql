-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "TenantPlan" AS ENUM ('FREE', 'PRO', 'ENTERPRISE', 'WHITELABEL');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CREATOR', 'ADMIN', 'AGENCY_MANAGER', 'FAN');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('YOUTUBE', 'INSTAGRAM', 'TIKTOK', 'FACEBOOK', 'TWITTER', 'THREADS');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('UPLOADING', 'UPLOADED', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "ClipStatus" AS ENUM ('GENERATING', 'READY', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('ORIGINAL', 'CLIP_SHARE', 'AFFILIATE', 'SPONSORED');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AffiliateEventType" AS ENUM ('CLICK', 'ADD_TO_CART', 'PURCHASE', 'REFUND');

-- CreateEnum
CREATE TYPE "KnowledgeSourceType" AS ENUM ('DOCUMENT', 'URL', 'VIDEO_TRANSCRIPT', 'MANUAL', 'QA_PAIRS');

-- CreateEnum
CREATE TYPE "KnowledgeStatus" AS ENUM ('PROCESSING', 'READY', 'ERROR');

-- CreateEnum
CREATE TYPE "BotAccessTier" AS ENUM ('FREE', 'MEMBER', 'PREMIUM');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DealType" AS ENUM ('SPONSORED_POST', 'AFFILIATE', 'AMBASSADOR', 'PRODUCT_REVIEW', 'EVENT');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('DRAFT', 'PROPOSAL_SENT', 'NEGOTIATING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'STARTER', 'PRO', 'BUSINESS');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RepurposeJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "RepurposeItemType" AS ENUM ('SOCIAL_POST', 'SHORT_VIDEO_SUGGESTION', 'EMAIL');

-- CreateEnum
CREATE TYPE "RepurposeItemStatus" AS ENUM ('GENERATED', 'EDITED', 'SCHEDULED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "CalendarItemStatus" AS ENUM ('SUGGESTED', 'PLANNED', 'IN_PRODUCTION', 'PUBLISHED', 'MEASURED', 'DISMISSED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "SuggestionSource" AS ENUM ('HISTORY', 'TREND', 'COMPETITOR', 'MIXED');

-- CreateEnum
CREATE TYPE "CommentCategory" AS ENUM ('POSITIVE', 'NEGATIVE', 'QUESTION', 'COLLABORATION', 'SPAM', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "CommentPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "TrendPhase" AS ENUM ('NEW', 'RISING', 'PEAK', 'DECLINING');

-- CreateEnum
CREATE TYPE "TrendSourcePlatform" AS ENUM ('RSS_TECHORANGE', 'RSS_ITHOME', 'RSS_BNEXT', 'RSS_TECHCRUNCH', 'RSS_THEVERGE', 'RSS_PRODUCTHUNT', 'RSS_CREATOR_ECONOMY', 'RSS_REDDIT', 'RSS_CLAUDE_CODE', 'API_DCARD', 'API_YOUTUBE_TRENDING', 'SCRAPER_TIKTOK', 'SCRAPER_THREADS');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TREND_KEYWORD_HIT', 'TREND_VIRAL_ALERT', 'TREND_DAILY_SUMMARY', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('PDF', 'TEMPLATE', 'PRESET', 'EBOOK', 'VIDEO_COURSE', 'AUDIO', 'OTHER');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "custom_domain" VARCHAR(255),
    "logo_url" TEXT,
    "theme_config" JSONB DEFAULT '{}',
    "plan" "TenantPlan" NOT NULL DEFAULT 'FREE',
    "stripe_customer_id" VARCHAR(255),
    "settings" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255),
    "display_name" VARCHAR(255) NOT NULL,
    "avatar_url" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CREATOR',
    "locale" VARCHAR(10) NOT NULL DEFAULT 'zh-TW',
    "timezone" VARCHAR(50),
    "stripe_customer_id" VARCHAR(255),
    "stripe_connect_id" VARCHAR(255),
    "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "platform_user_id" VARCHAR(255) NOT NULL,
    "platform_username" VARCHAR(255) NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "scopes" TEXT[],
    "follower_count" INTEGER DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videos" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "original_url" TEXT NOT NULL,
    "duration_seconds" INTEGER,
    "file_size_bytes" BIGINT,
    "mime_type" VARCHAR(100),
    "status" "VideoStatus" NOT NULL DEFAULT 'UPLOADING',
    "transcript" JSONB,
    "ai_summary" TEXT,
    "thumbnail_url" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_clips" (
    "id" UUID NOT NULL,
    "video_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "start_time" DOUBLE PRECISION NOT NULL,
    "end_time" DOUBLE PRECISION NOT NULL,
    "clip_url" TEXT,
    "thumbnail_url" TEXT,
    "duration_seconds" INTEGER,
    "ai_score" DOUBLE PRECISION,
    "hashtags" TEXT[],
    "status" "ClipStatus" NOT NULL DEFAULT 'GENERATING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_clips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "content_text" TEXT,
    "media_urls" TEXT[],
    "clip_id" UUID,
    "platforms" JSONB,
    "type" "PostType" NOT NULL DEFAULT 'ORIGINAL',
    "ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "affiliate_links" JSONB,
    "hashtags" TEXT[],
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduled_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_links" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "original_url" TEXT NOT NULL,
    "tracking_code" VARCHAR(50) NOT NULL,
    "short_url" TEXT,
    "product_name" VARCHAR(500),
    "commission_rate" DECIMAL(5,4),
    "click_count" INTEGER NOT NULL DEFAULT 0,
    "conversion_count" INTEGER NOT NULL DEFAULT 0,
    "revenue_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_events" (
    "id" UUID NOT NULL,
    "link_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "event_type" "AffiliateEventType" NOT NULL,
    "source_post_id" UUID,
    "visitor_id" VARCHAR(255),
    "ip_hash" VARCHAR(64),
    "user_agent" TEXT,
    "referrer" TEXT,
    "revenue_amount" DECIMAL(12,2),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_bases" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "source_type" "KnowledgeSourceType" NOT NULL,
    "status" "KnowledgeStatus" NOT NULL DEFAULT 'PROCESSING',
    "document_count" INTEGER NOT NULL DEFAULT 0,
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "settings" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunks" (
    "id" UUID NOT NULL,
    "knowledge_base_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "source_ref" VARCHAR(500),
    "chunk_index" INTEGER NOT NULL,
    "token_count" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_configs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "avatar_url" TEXT,
    "welcome_message" TEXT,
    "system_prompt" TEXT,
    "knowledge_base_id" UUID,
    "personality" JSONB,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "access_tier" "BotAccessTier" NOT NULL DEFAULT 'FREE',
    "pricing" JSONB,
    "embed_config" JSONB,
    "total_conversations" INTEGER NOT NULL DEFAULT 0,
    "total_messages" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "bot_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "fan_user_id" UUID,
    "anonymous_id" VARCHAR(255),
    "messages" JSONB[],
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "satisfaction_score" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_tiers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "price_monthly" DECIMAL(10,2) NOT NULL,
    "price_yearly" DECIMAL(10,2),
    "benefits" JSONB,
    "stripe_price_id" VARCHAR(255),
    "bot_access_tier" "BotAccessTier" NOT NULL DEFAULT 'FREE',
    "max_members" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "fan_user_id" UUID NOT NULL,
    "creator_user_id" UUID NOT NULL,
    "tier_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "stripe_subscription_id" VARCHAR(255),
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_deals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "brand_name" VARCHAR(255) NOT NULL,
    "brand_contact" JSONB,
    "deal_type" "DealType" NOT NULL,
    "status" "DealStatus" NOT NULL DEFAULT 'DRAFT',
    "budget_range" JSONB,
    "deliverables" JSONB,
    "ai_proposal" TEXT,
    "proposal_pdf_url" TEXT,
    "timeline_start" DATE,
    "timeline_end" DATE,
    "actual_revenue" DECIMAL(12,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_analytics" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "social_account_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "followers" INTEGER,
    "views" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "revenue" DECIMAL(12,2),
    "engagement_rate" DOUBLE PRECISION,
    "top_content" JSONB,
    "raw_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
    "stripe_subscription_id" VARCHAR(255),
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "current_period_end" TIMESTAMP(3),
    "usage" JSONB,
    "limits" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_clips" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "raw_content" TEXT NOT NULL,
    "ai_summary" TEXT,
    "ai_category" TEXT,
    "ai_tags" TEXT[],
    "author" TEXT,
    "image_url" TEXT,
    "is_starred" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_clips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "landing_pages" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "headline" VARCHAR(500),
    "subheadline" TEXT,
    "bio" TEXT,
    "avatar_url" TEXT,
    "cover_url" TEXT,
    "theme" VARCHAR(50) NOT NULL DEFAULT 'default',
    "color_scheme" JSONB DEFAULT '{}',
    "social_links" JSONB DEFAULT '[]',
    "cta_buttons" JSONB DEFAULT '[]',
    "sections" JSONB DEFAULT '[]',
    "custom_css" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "landing_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digital_products" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "ai_description" TEXT,
    "product_type" "ProductType" NOT NULL DEFAULT 'OTHER',
    "price" INTEGER NOT NULL,
    "compare_at_price" INTEGER,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'TWD',
    "file_url" TEXT,
    "cover_image_url" TEXT,
    "preview_images" TEXT[],
    "tags" TEXT[],
    "ai_tags" TEXT[],
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "sales_count" INTEGER NOT NULL DEFAULT 0,
    "total_revenue" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "digital_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_orders" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "buyer_email" VARCHAR(255) NOT NULL,
    "buyer_name" VARCHAR(255),
    "amount" INTEGER NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'TWD',
    "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "stripe_session_id" VARCHAR(255),
    "stripe_payment_intent_id" VARCHAR(255),
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "download_token" VARCHAR(64),
    "download_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_subscribers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255),
    "source" VARCHAR(100),
    "tags" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaigns" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" VARCHAR(50) NOT NULL DEFAULT 'SINGLE',
    "status" VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    "target_tags" TEXT[],
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "open_count" INTEGER NOT NULL DEFAULT 0,
    "click_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "subject" VARCHAR(500) NOT NULL,
    "body" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "delay_days" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repurpose_jobs" (
    "id" UUID NOT NULL,
    "video_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "status" "RepurposeJobStatus" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repurpose_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repurpose_items" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "type" "RepurposeItemType" NOT NULL,
    "status" "RepurposeItemStatus" NOT NULL DEFAULT 'GENERATED',
    "platform" VARCHAR(50),
    "style" VARCHAR(50),
    "original_content" JSONB NOT NULL,
    "edited_content" JSONB,
    "metadata" JSONB,
    "post_id" UUID,
    "campaign_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repurpose_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_suggestions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "data_source" "SuggestionSource" NOT NULL,
    "performance_score" DOUBLE PRECISION NOT NULL,
    "confidence_level" "ConfidenceLevel" NOT NULL,
    "confidence_reason" TEXT,
    "suggested_date" DATE,
    "suggested_platforms" TEXT[],
    "tags" TEXT[],
    "related_trends" TEXT[],
    "competitor_ref" TEXT,
    "is_adopted" BOOLEAN NOT NULL DEFAULT false,
    "is_dismissed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topic_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_calendar" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "suggestion_id" UUID,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "status" "CalendarItemStatus" NOT NULL DEFAULT 'SUGGESTED',
    "scheduled_date" DATE NOT NULL,
    "scheduled_time" VARCHAR(5),
    "target_platforms" TEXT[],
    "video_id" UUID,
    "post_id" UUID,
    "notes" TEXT,
    "actual_views" INTEGER,
    "actual_likes" INTEGER,
    "actual_comments" INTEGER,
    "actual_engagement" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_calendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitors" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "platform" VARCHAR(50) NOT NULL DEFAULT 'YOUTUBE',
    "channel_id" VARCHAR(255) NOT NULL,
    "channel_url" TEXT NOT NULL,
    "channel_name" VARCHAR(255) NOT NULL,
    "channel_avatar" TEXT,
    "subscriber_count" INTEGER,
    "video_count" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_videos" (
    "id" UUID NOT NULL,
    "competitor_id" UUID NOT NULL,
    "platform_video_id" VARCHAR(255) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "thumbnail_url" TEXT,
    "view_count" INTEGER,
    "like_count" INTEGER,
    "comment_count" INTEGER,
    "published_at" TIMESTAMP(3) NOT NULL,
    "duration_seconds" INTEGER,
    "tags" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitor_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fan_comments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "platform" VARCHAR(50),
    "author_name" VARCHAR(255) NOT NULL,
    "author_avatar" TEXT,
    "content" TEXT NOT NULL,
    "published_at" TIMESTAMP(3),
    "source_url" TEXT,
    "category" "CommentCategory" NOT NULL DEFAULT 'NEUTRAL',
    "sentiment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priority" "CommentPriority" NOT NULL DEFAULT 'LOW',
    "is_replied" BOOLEAN NOT NULL DEFAULT false,
    "ai_reply" TEXT,
    "final_reply" TEXT,
    "replied_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fan_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trend_snapshots" (
    "id" UUID NOT NULL,
    "sources" "TrendSourcePlatform"[],
    "topic_count" INTEGER NOT NULL,
    "ai_analysis" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trend_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trend_topics" (
    "id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "summary" TEXT NOT NULL,
    "source" VARCHAR(100) NOT NULL,
    "source_platform" "TrendSourcePlatform" NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "relevance_score" DOUBLE PRECISION NOT NULL,
    "content_ideas" TEXT[],
    "url" TEXT,
    "phase" "TrendPhase" NOT NULL DEFAULT 'NEW',
    "is_cross_platform" BOOLEAN NOT NULL DEFAULT false,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trend_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trend_keywords" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "keyword" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_hit_at" TIMESTAMP(3),
    "hit_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trend_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trend_user_settings" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "notify_keyword_hit" BOOLEAN NOT NULL DEFAULT true,
    "notify_viral_alert" BOOLEAN NOT NULL DEFAULT true,
    "notify_daily_summary" BOOLEAN NOT NULL DEFAULT true,
    "email_keyword_hit" BOOLEAN NOT NULL DEFAULT false,
    "email_viral_alert" BOOLEAN NOT NULL DEFAULT false,
    "email_daily_summary" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trend_user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "metadata" JSONB DEFAULT '{}',
    "link_url" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "social_accounts_tenant_id_user_id_idx" ON "social_accounts"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_user_id_platform_platform_user_id_key" ON "social_accounts"("user_id", "platform", "platform_user_id");

-- CreateIndex
CREATE INDEX "videos_tenant_id_user_id_status_idx" ON "videos"("tenant_id", "user_id", "status");

-- CreateIndex
CREATE INDEX "video_clips_video_id_idx" ON "video_clips"("video_id");

-- CreateIndex
CREATE INDEX "video_clips_tenant_id_idx" ON "video_clips"("tenant_id");

-- CreateIndex
CREATE INDEX "posts_tenant_id_user_id_status_idx" ON "posts"("tenant_id", "user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_links_tracking_code_key" ON "affiliate_links"("tracking_code");

-- CreateIndex
CREATE INDEX "affiliate_links_tenant_id_user_id_idx" ON "affiliate_links"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "affiliate_events_link_id_event_type_idx" ON "affiliate_events"("link_id", "event_type");

-- CreateIndex
CREATE INDEX "affiliate_events_tenant_id_created_at_idx" ON "affiliate_events"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "knowledge_bases_tenant_id_user_id_idx" ON "knowledge_bases"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "knowledge_chunks_knowledge_base_id_idx" ON "knowledge_chunks"("knowledge_base_id");

-- CreateIndex
CREATE INDEX "bot_configs_tenant_id_user_id_idx" ON "bot_configs"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "conversations_bot_id_created_at_idx" ON "conversations"("bot_id", "created_at");

-- CreateIndex
CREATE INDEX "conversations_tenant_id_idx" ON "conversations"("tenant_id");

-- CreateIndex
CREATE INDEX "membership_tiers_tenant_id_user_id_idx" ON "membership_tiers"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "memberships_tenant_id_creator_user_id_status_idx" ON "memberships"("tenant_id", "creator_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_fan_user_id_creator_user_id_tier_id_key" ON "memberships"("fan_user_id", "creator_user_id", "tier_id");

-- CreateIndex
CREATE INDEX "brand_deals_tenant_id_user_id_status_idx" ON "brand_deals"("tenant_id", "user_id", "status");

-- CreateIndex
CREATE INDEX "platform_analytics_tenant_id_user_id_date_idx" ON "platform_analytics"("tenant_id", "user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "platform_analytics_social_account_id_date_key" ON "platform_analytics"("social_account_id", "date");

-- CreateIndex
CREATE INDEX "subscriptions_tenant_id_user_id_idx" ON "subscriptions"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "content_clips_user_id_created_at_idx" ON "content_clips"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "content_clips_tenant_id_idx" ON "content_clips"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "landing_pages_slug_key" ON "landing_pages"("slug");

-- CreateIndex
CREATE INDEX "landing_pages_user_id_idx" ON "landing_pages"("user_id");

-- CreateIndex
CREATE INDEX "landing_pages_tenant_id_idx" ON "landing_pages"("tenant_id");

-- CreateIndex
CREATE INDEX "digital_products_user_id_is_published_idx" ON "digital_products"("user_id", "is_published");

-- CreateIndex
CREATE INDEX "digital_products_tenant_id_idx" ON "digital_products"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_orders_stripe_session_id_key" ON "product_orders"("stripe_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_orders_download_token_key" ON "product_orders"("download_token");

-- CreateIndex
CREATE INDEX "product_orders_product_id_idx" ON "product_orders"("product_id");

-- CreateIndex
CREATE INDEX "product_orders_buyer_email_idx" ON "product_orders"("buyer_email");

-- CreateIndex
CREATE INDEX "email_subscribers_user_id_is_active_idx" ON "email_subscribers"("user_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "email_subscribers_user_id_email_key" ON "email_subscribers"("user_id", "email");

-- CreateIndex
CREATE INDEX "email_campaigns_user_id_idx" ON "email_campaigns"("user_id");

-- CreateIndex
CREATE INDEX "email_templates_campaign_id_idx" ON "email_templates"("campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "repurpose_jobs_video_id_key" ON "repurpose_jobs"("video_id");

-- CreateIndex
CREATE INDEX "repurpose_jobs_tenant_id_user_id_idx" ON "repurpose_jobs"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "repurpose_items_job_id_type_idx" ON "repurpose_items"("job_id", "type");

-- CreateIndex
CREATE INDEX "topic_suggestions_tenant_id_user_id_created_at_idx" ON "topic_suggestions"("tenant_id", "user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "topic_suggestions_batch_id_idx" ON "topic_suggestions"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_calendar_suggestion_id_key" ON "content_calendar"("suggestion_id");

-- CreateIndex
CREATE INDEX "content_calendar_tenant_id_user_id_scheduled_date_idx" ON "content_calendar"("tenant_id", "user_id", "scheduled_date");

-- CreateIndex
CREATE INDEX "content_calendar_status_idx" ON "content_calendar"("status");

-- CreateIndex
CREATE INDEX "competitors_tenant_id_user_id_idx" ON "competitors"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "competitors_user_id_channel_id_key" ON "competitors"("user_id", "channel_id");

-- CreateIndex
CREATE INDEX "competitor_videos_competitor_id_published_at_idx" ON "competitor_videos"("competitor_id", "published_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "competitor_videos_competitor_id_platform_video_id_key" ON "competitor_videos"("competitor_id", "platform_video_id");

-- CreateIndex
CREATE INDEX "fan_comments_tenant_id_user_id_category_idx" ON "fan_comments"("tenant_id", "user_id", "category");

-- CreateIndex
CREATE INDEX "fan_comments_tenant_id_user_id_is_replied_idx" ON "fan_comments"("tenant_id", "user_id", "is_replied");

-- CreateIndex
CREATE INDEX "fan_comments_created_at_idx" ON "fan_comments"("created_at" DESC);

-- CreateIndex
CREATE INDEX "trend_snapshots_generated_at_idx" ON "trend_snapshots"("generated_at" DESC);

-- CreateIndex
CREATE INDEX "trend_topics_snapshot_id_idx" ON "trend_topics"("snapshot_id");

-- CreateIndex
CREATE INDEX "trend_topics_fingerprint_snapshot_id_idx" ON "trend_topics"("fingerprint", "snapshot_id");

-- CreateIndex
CREATE INDEX "trend_topics_category_idx" ON "trend_topics"("category");

-- CreateIndex
CREATE INDEX "trend_keywords_tenant_id_user_id_idx" ON "trend_keywords"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "trend_keywords_user_id_keyword_key" ON "trend_keywords"("user_id", "keyword");

-- CreateIndex
CREATE UNIQUE INDEX "trend_user_settings_user_id_key" ON "trend_user_settings"("user_id");

-- CreateIndex
CREATE INDEX "trend_user_settings_tenant_id_idx" ON "trend_user_settings"("tenant_id");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_user_id_is_read_created_at_idx" ON "notifications"("tenant_id", "user_id", "is_read", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_clips" ADD CONSTRAINT "video_clips_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_clips" ADD CONSTRAINT "video_clips_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_clip_id_fkey" FOREIGN KEY ("clip_id") REFERENCES "video_clips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_events" ADD CONSTRAINT "affiliate_events_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "affiliate_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_events" ADD CONSTRAINT "affiliate_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_configs" ADD CONSTRAINT "bot_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_configs" ADD CONSTRAINT "bot_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_configs" ADD CONSTRAINT "bot_configs_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bot_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_tiers" ADD CONSTRAINT "membership_tiers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_tiers" ADD CONSTRAINT "membership_tiers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_fan_user_id_fkey" FOREIGN KEY ("fan_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_creator_user_id_fkey" FOREIGN KEY ("creator_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "membership_tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_deals" ADD CONSTRAINT "brand_deals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_deals" ADD CONSTRAINT "brand_deals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_analytics" ADD CONSTRAINT "platform_analytics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_analytics" ADD CONSTRAINT "platform_analytics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_analytics" ADD CONSTRAINT "platform_analytics_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_clips" ADD CONSTRAINT "content_clips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_clips" ADD CONSTRAINT "content_clips_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_products" ADD CONSTRAINT "digital_products_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_products" ADD CONSTRAINT "digital_products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_orders" ADD CONSTRAINT "product_orders_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "digital_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_subscribers" ADD CONSTRAINT "email_subscribers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_subscribers" ADD CONSTRAINT "email_subscribers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "email_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repurpose_jobs" ADD CONSTRAINT "repurpose_jobs_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repurpose_jobs" ADD CONSTRAINT "repurpose_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repurpose_jobs" ADD CONSTRAINT "repurpose_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repurpose_items" ADD CONSTRAINT "repurpose_items_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "repurpose_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_suggestions" ADD CONSTRAINT "topic_suggestions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_suggestions" ADD CONSTRAINT "topic_suggestions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_calendar" ADD CONSTRAINT "content_calendar_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_calendar" ADD CONSTRAINT "content_calendar_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_calendar" ADD CONSTRAINT "content_calendar_suggestion_id_fkey" FOREIGN KEY ("suggestion_id") REFERENCES "topic_suggestions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_videos" ADD CONSTRAINT "competitor_videos_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "competitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fan_comments" ADD CONSTRAINT "fan_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fan_comments" ADD CONSTRAINT "fan_comments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trend_topics" ADD CONSTRAINT "trend_topics_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "trend_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trend_keywords" ADD CONSTRAINT "trend_keywords_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trend_keywords" ADD CONSTRAINT "trend_keywords_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trend_user_settings" ADD CONSTRAINT "trend_user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trend_user_settings" ADD CONSTRAINT "trend_user_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

┌─────────────────────────────────────────────────────────┐
│  Update available 5.22.0 -> 7.6.0                       │
│                                                         │
│  This is a major update - please follow the guide at    │
│  https://pris.ly/d/major-version-upgrade                │
│                                                         │
│  Run the following to update                            │
│    npm i --save-dev prisma@latest                       │
│    npm i @prisma/client@latest                          │
└─────────────────────────────────────────────────────────┘
