import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ─── Helpers ───

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(10, 0, 0, 0);
  return d;
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seed() {
  console.log('🌱 Seeding database...');

  // ─── 1. System Tenant + Admin ───
  const systemTenant = await prisma.tenant.upsert({
    where: { slug: 'system' },
    update: {},
    create: { name: 'System', slug: 'system', plan: 'ENTERPRISE' },
  });

  const adminHash = await bcrypt.hash('ChangeMe123!', 12);
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: systemTenant.id, email: 'admin@creator-platform.com' } },
    update: {},
    create: {
      tenantId: systemTenant.id,
      email: 'admin@creator-platform.com',
      passwordHash: adminHash,
      displayName: 'System Admin',
      role: 'ADMIN',
      onboardingCompleted: true,
    },
  });
  console.log('✅ System tenant + admin');

  // ─── 2. Find Demo User (demo@example.com) ───
  // This user was created via registration. Find their tenant.
  let demoUser = await prisma.user.findFirst({ where: { email: 'demo@example.com' } });
  let demoTenant: { id: string };

  if (!demoUser) {
    // Fallback: create demo tenant + user if not registered yet
    demoTenant = await prisma.tenant.upsert({
      where: { slug: 'demo-nick' },
      update: {},
      create: { name: 'Nick Creates', slug: 'demo-nick', plan: 'PRO' },
    });
    const demoHash = await bcrypt.hash('Nick1020', 12);
    demoUser = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: demoTenant.id, email: 'demo@example.com' } },
      update: {},
      create: {
        tenantId: demoTenant.id,
        email: 'demo@example.com',
        passwordHash: demoHash,
        displayName: 'Nick',
        role: 'CREATOR',
        onboardingCompleted: true,
        locale: 'zh-TW',
        timezone: 'Asia/Taipei',
      },
    });
  } else {
    demoTenant = { id: demoUser.tenantId };
    // Update display name
    await prisma.user.update({
      where: { id: demoUser.id },
      data: { displayName: 'Nick', locale: 'zh-TW', timezone: 'Asia/Taipei' },
    });
    // Update tenant plan and name
    await prisma.tenant.update({
      where: { id: demoTenant.id },
      data: { plan: 'PRO', name: 'Nick Creates' },
    });
  }

  const userId = demoUser.id;
  const tenantId = demoTenant.id;
  console.log(`✅ Demo user: ${userId} (tenant: ${tenantId})`);

  // ─── 3. Social Accounts ───
  const socialAccounts = [
    { platform: 'YOUTUBE' as const, platformUserId: 'UC_nick_creates', platformUsername: '@nick_creates', followerCount: 125000 },
    { platform: 'INSTAGRAM' as const, platformUserId: '17841400nick', platformUsername: '@nick.creates', followerCount: 85000 },
    { platform: 'TIKTOK' as const, platformUserId: 'tiktok_nick_creates', platformUsername: '@nickcreates', followerCount: 210000 },
  ];

  const createdAccounts = [];
  for (const sa of socialAccounts) {
    const account = await prisma.socialAccount.upsert({
      where: { userId_platform_platformUserId: { userId, platform: sa.platform, platformUserId: sa.platformUserId } },
      update: { followerCount: sa.followerCount },
      create: {
        userId,
        tenantId,
        platform: sa.platform,
        platformUserId: sa.platformUserId,
        platformUsername: sa.platformUsername,
        accessToken: 'demo-token-encrypted',
        refreshToken: 'demo-refresh-encrypted',
        tokenExpiresAt: daysFromNow(30),
        scopes: ['read', 'write'],
        followerCount: sa.followerCount,
        isActive: true,
        lastSyncedAt: daysAgo(0),
      },
    });
    createdAccounts.push(account);
  }
  console.log(`✅ ${createdAccounts.length} social accounts`);

  // ─── 4. Platform Analytics (90 days per account) ───
  // Delete existing analytics for clean re-seed
  await prisma.platformAnalytics.deleteMany({ where: { userId } });

  const analyticsData: any[] = [];
  const baseStats = {
    YOUTUBE: { baseFollowers: 118000, dailyViews: [5000, 15000], engagement: [0.03, 0.055], dailyRevenue: [15, 80] },
    INSTAGRAM: { baseFollowers: 79000, dailyViews: [3000, 8000], engagement: [0.05, 0.085], dailyRevenue: [5, 25] },
    TIKTOK: { baseFollowers: 195000, dailyViews: [10000, 50000], engagement: [0.08, 0.125], dailyRevenue: [8, 40] },
  };

  for (const account of createdAccounts) {
    const stats = baseStats[account.platform as keyof typeof baseStats];
    for (let day = 89; day >= 0; day--) {
      const growthFactor = 1 + ((89 - day) / 89) * 0.08; // 8% growth over 90 days
      const weekdayBoost = new Date(daysAgo(day)).getDay() % 6 !== 0 ? 1.2 : 0.85;
      const followers = Math.floor(stats.baseFollowers * growthFactor);
      const views = Math.floor(randomBetween(stats.dailyViews[0], stats.dailyViews[1]) * weekdayBoost * growthFactor);
      const engRate = stats.engagement[0] + Math.random() * (stats.engagement[1] - stats.engagement[0]);
      const likes = Math.floor(views * engRate);
      const comments = Math.floor(likes * 0.08);
      const shares = Math.floor(likes * 0.03);
      const revenue = randomBetween(stats.dailyRevenue[0] * 100, stats.dailyRevenue[1] * 100) / 100;

      analyticsData.push({
        userId,
        tenantId,
        socialAccountId: account.id,
        date: daysAgo(day),
        followers,
        views,
        likes,
        comments,
        shares,
        revenue,
        engagementRate: Math.round(engRate * 10000) / 10000,
      });
    }
  }

  await prisma.platformAnalytics.createMany({ data: analyticsData });
  console.log(`✅ ${analyticsData.length} analytics records`);

  // ─── 5. Videos ───
  // Clean existing
  await prisma.videoClip.deleteMany({ where: { tenantId } });
  await prisma.post.deleteMany({ where: { tenantId } });
  await prisma.video.deleteMany({ where: { tenantId } });

  // Public domain sample videos for demo playback
  const sampleVideos = [
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
  ];
  // Thumbnails from picsum for realistic card previews
  const sampleThumbnails = [
    'https://picsum.photos/seed/cook/640/360',
    'https://picsum.photos/seed/tokyo/640/360',
    'https://picsum.photos/seed/phone/640/360',
    'https://picsum.photos/seed/python/640/360',
    'https://picsum.photos/seed/studio/640/360',
  ];

  const videoData = [
    { title: '10 分鐘快速日式便當教學', duration: 620, summary: '示範三道簡單日式便當菜色，包含玉子燒、照燒雞腿和味噌湯。適合忙碌上班族的快速料理教學。' },
    { title: 'Vlog: 一日東京行程攻略', duration: 915, summary: '從淺草寺到涉谷十字路口，完整紀錄東京一日遊的最佳路線、美食推薦和省錢技巧。' },
    { title: '開箱 iPhone 16 Pro — 值得升級嗎？', duration: 480, summary: '深度開箱 iPhone 16 Pro，包含相機對比測試、電池續航實測、以及與前代的效能比較。' },
    { title: '30 天學會 Python — 從零到做出 AI 專案', duration: 1200, summary: '30 天 Python 挑戰的完整教學，從基礎語法到使用 OpenAI API 建構個人 AI 助理。' },
    { title: '工作室改造全紀錄 — 10 萬預算打造夢想空間', duration: 780, summary: '從空房到完工，紀錄整個工作室改造過程，包含設備採購、燈光配置和隔音處理。' },
  ];

  const createdVideos = [];
  for (let idx = 0; idx < videoData.length; idx++) {
    const v = videoData[idx];
    const video = await prisma.video.create({
      data: {
        userId,
        tenantId,
        title: v.title,
        originalUrl: sampleVideos[idx],
        thumbnailUrl: sampleThumbnails[idx],
        durationSeconds: v.duration,
        fileSizeBytes: BigInt(v.duration * 2_500_000),
        mimeType: 'video/mp4',
        status: 'PROCESSED',
        aiSummary: v.summary,
        transcript: {
          segments: [
            { start: 0, end: 15, text: `大家好，歡迎來到我的頻道！今天要跟大家分享的是「${v.title}」` },
            { start: 15, end: 45, text: '在開始之前，如果你還沒訂閱，記得按下訂閱和小鈴鐺，這樣就不會錯過未來的影片。' },
            { start: 45, end: 90, text: '好，那我們直接開始今天的內容。首先我想先跟大家說明一下整體的規劃...' },
          ],
        },
        createdAt: daysAgo(randomBetween(5, 60)),
      },
    });
    createdVideos.push(video);
  }
  console.log(`✅ ${createdVideos.length} videos`);

  // ─── 6. Video Clips ───
  const clipTemplates = [
    [
      { title: '精華片段 — 玉子燒製作秘訣', startTime: 120, endTime: 178, score: 0.94 },
      { title: '60秒學會照燒醬汁', startTime: 250, endTime: 310, score: 0.88 },
      { title: '便當擺盤技巧', startTime: 480, endTime: 545, score: 0.82 },
    ],
    [
      { title: '淺草寺日出 — 超美晨光', startTime: 60, endTime: 120, score: 0.91 },
      { title: '涉谷最值得吃的拉麵', startTime: 380, endTime: 440, score: 0.87 },
    ],
    [
      { title: 'iPhone 16 Pro 相機對比實測', startTime: 90, endTime: 165, score: 0.93 },
      { title: '電池續航驚人結果', startTime: 300, endTime: 360, score: 0.85 },
      { title: '值不值得升級？最終結論', startTime: 420, endTime: 475, score: 0.90 },
    ],
    [
      { title: '零基礎也能懂的 Python 入門', startTime: 0, endTime: 60, score: 0.89 },
      { title: 'AI 助理 Demo — 30 天成果展示', startTime: 1080, endTime: 1180, score: 0.95 },
    ],
    [
      { title: '改造前 vs 改造後對比', startTime: 0, endTime: 45, score: 0.92 },
      { title: '設備採購清單分享', startTime: 360, endTime: 430, score: 0.86 },
      { title: '完工工作室 Tour', startTime: 680, endTime: 770, score: 0.91 },
    ],
  ];

  let totalClips = 0;
  const allClips: any[] = [];
  for (let i = 0; i < createdVideos.length; i++) {
    for (const clip of clipTemplates[i]) {
      const c = await prisma.videoClip.create({
        data: {
          videoId: createdVideos[i].id,
          tenantId,
          title: clip.title,
          startTime: clip.startTime,
          endTime: clip.endTime,
          durationSeconds: clip.endTime - clip.startTime,
          aiScore: clip.score,
          hashtags: ['#creator', '#content', '#trending'],
          status: 'READY',
        },
      });
      allClips.push(c);
      totalClips++;
    }
  }
  console.log(`✅ ${totalClips} video clips`);

  // ─── 7. Posts ───
  const posts = [
    // Published
    {
      contentText: '新影片上線！🎬 10 分鐘教你做出超美味日式便當，上班族必學！食譜在影片描述欄 👇',
      platforms: [{ platform: 'YOUTUBE', config: {} }, { platform: 'INSTAGRAM', config: {} }],
      hashtags: ['#日式便當', '#料理教學', '#上班族料理'],
      status: 'PUBLISHED' as const,
      publishedAt: daysAgo(3),
      clipId: allClips[0]?.id,
    },
    {
      contentText: '東京一日遊攻略來了！從淺草到涉谷，跟著我的路線走絕對不踩雷 🗼✨',
      platforms: [{ platform: 'INSTAGRAM', config: {} }, { platform: 'TIKTOK', config: {} }],
      hashtags: ['#東京旅遊', '#日本攻略', '#Vlog'],
      status: 'PUBLISHED' as const,
      publishedAt: daysAgo(7),
      clipId: allClips[3]?.id,
    },
    {
      contentText: 'iPhone 16 Pro 深度評測！相機拍攝對比測試結果讓我驚訝 😮 完整影片連結在 bio',
      platforms: [{ platform: 'TIKTOK', config: {} }],
      hashtags: ['#iPhone16Pro', '#開箱', '#科技'],
      status: 'PUBLISHED' as const,
      publishedAt: daysAgo(14),
    },
    // Scheduled
    {
      contentText: '下週要來分享我的 2026 年目標設定方法！不只是寫目標，而是建立系統 📋',
      platforms: [{ platform: 'YOUTUBE', config: {} }, { platform: 'INSTAGRAM', config: {} }],
      hashtags: ['#目標設定', '#生產力', '#2026'],
      status: 'SCHEDULED' as const,
      scheduledAt: daysFromNow(1),
    },
    {
      contentText: '工作室改造 Vlog 即將上線！10 萬預算到底能做到什麼程度？🏠',
      platforms: [{ platform: 'YOUTUBE', config: {} }],
      hashtags: ['#工作室', '#Room Tour', '#改造'],
      status: 'SCHEDULED' as const,
      scheduledAt: daysFromNow(3),
    },
    {
      contentText: 'Python 30 天挑戰最終回！從零到做出 AI 助理的完整紀錄 🤖',
      platforms: [{ platform: 'YOUTUBE', config: {} }, { platform: 'TIKTOK', config: {} }],
      hashtags: ['#Python', '#AI', '#程式教學'],
      status: 'SCHEDULED' as const,
      scheduledAt: daysFromNow(5),
    },
    // Drafts
    {
      contentText: '最近在研究的 AI 工具推薦清單，想聽聽大家的意見...',
      platforms: [{ platform: 'INSTAGRAM', config: {} }],
      hashtags: ['#AI工具'],
      status: 'DRAFT' as const,
    },
    {
      contentText: '',
      platforms: [{ platform: 'YOUTUBE', config: {} }],
      hashtags: [],
      status: 'DRAFT' as const,
    },
  ];

  for (const p of posts) {
    await prisma.post.create({
      data: {
        userId,
        tenantId,
        contentText: p.contentText,
        platforms: p.platforms,
        hashtags: p.hashtags,
        status: p.status,
        scheduledAt: p.scheduledAt ?? null,
        publishedAt: p.publishedAt ?? null,
        clipId: p.clipId ?? null,
        type: p.clipId ? 'CLIP_SHARE' : 'ORIGINAL',
        createdAt: p.publishedAt ?? p.scheduledAt ?? daysAgo(1),
      },
    });
  }
  console.log(`✅ ${posts.length} posts`);

  // ─── 8. Knowledge Base ───
  await prisma.knowledgeChunk.deleteMany({ where: { knowledgeBase: { tenantId } } });
  await prisma.botConfig.updateMany({ where: { tenantId }, data: { knowledgeBaseId: null } });
  await prisma.knowledgeBase.deleteMany({ where: { tenantId } });

  const kb = await prisma.knowledgeBase.create({
    data: {
      userId,
      tenantId,
      name: 'Nick 的創作指南',
      description: '包含頻道資訊、合作方式、會員權益等常見問題',
      sourceType: 'MANUAL',
      status: 'READY',
      documentCount: 1,
      chunkCount: 5,
    },
  });

  const kbChunks = [
    { title: '頻道簡介', content: 'Nick Creates 是一個專注於科技、生活和創作的 YouTube 頻道。主要內容包括科技產品開箱評測、生活 Vlog、料理教學和程式教學。目前在 YouTube 有 12.5 萬訂閱、Instagram 8.5 萬粉絲、TikTok 21 萬粉絲。每週固定更新 2-3 支影片。' },
    { title: '合作方式', content: '合作方式包括：1. 產品開箱評測（適合 3C 品牌）；2. 贊助影片（品牌植入式內容）；3. 品牌大使（長期合作方案）；4. 聯名活動（線下活動或限定商品）。合作預算起步為 NT$30,000，視合作範圍而定。' },
    { title: '會員權益', content: '會員分為三個等級：免費會員可觀看公開影片和參與社群；Pro 會員（NT$199/月）享有獨家幕後花絮、搶先觀看新影片、專屬 Discord 頻道；VIP 會員（NT$499/月）額外享有每月一次線上 Q&A、個人化建議和完整教學資源庫。' },
    { title: '常見問題', content: 'Q: 如何聯繫合作？A: 請透過 Email: nick@nickcreates.com 或平台私訊聯繫。Q: 影片使用什麼設備？A: 主力相機 Sony A7IV，鏡頭 24-70mm f/2.8，麥克風 Rode VideoMic Pro，燈光 Aputure 300d。Q: 多久更新一次？A: 每週二和週五固定更新。' },
    { title: '關於 Nick', content: 'Nick 是一位全職 YouTuber 和內容創作者，2022 年開始全職創作，過去曾在科技業擔任軟體工程師。擅長將複雜的科技概念用簡單有趣的方式呈現。興趣包括攝影、料理和旅行。座右銘：「持續創作，持續學習」。' },
  ];

  for (const chunk of kbChunks) {
    await prisma.knowledgeChunk.create({
      data: {
        knowledgeBaseId: kb.id,
        content: chunk.content,
        metadata: { title: chunk.title },
        tokenCount: Math.floor(chunk.content.length / 2),
        chunkIndex: kbChunks.indexOf(chunk),
      },
    });
  }
  console.log('✅ Knowledge base + 5 chunks');

  // ─── 9. Bot Config ───
  await prisma.conversation.deleteMany({ where: { tenantId } });
  await prisma.botConfig.deleteMany({ where: { tenantId } });

  const bot = await prisma.botConfig.create({
    data: {
      userId,
      tenantId,
      name: 'Nick AI 助理',
      welcomeMessage: '嗨！我是 Nick 的 AI 助理 👋 有任何關於頻道、合作或會員的問題，都可以問我！',
      systemPrompt: '你是 Nick Creates 的 AI 助理。你要用親切、專業的語氣回答粉絲的問題。你了解頻道的所有資訊，包括內容方向、合作方式、會員權益等。回答要簡潔有力，必要時可以推薦相關影片或會員方案。',
      knowledgeBaseId: kb.id,
      personality: { tone: 'friendly', language: 'zh-TW' },
      isPublic: true,
      accessTier: 'FREE',
      totalConversations: 47,
      totalMessages: 312,
    },
  });

  // Sample conversation
  await prisma.conversation.create({
    data: {
      botId: bot.id,
      tenantId,
      anonymousId: 'demo-visitor-001',
      messageCount: 4,
      messages: [
        { role: 'assistant', content: '嗨！我是 Nick 的 AI 助理 👋 有任何問題都可以問我！', timestamp: daysAgo(2).toISOString() },
        { role: 'user', content: '請問會員有什麼權益？', timestamp: daysAgo(2).toISOString() },
        { role: 'assistant', content: '我們有三個會員等級：\n\n🆓 **免費會員**：觀看公開影片、參與社群討論\n⭐ **Pro 會員（NT$199/月）**：獨家幕後花絮、搶先觀看、專屬 Discord\n👑 **VIP 會員（NT$499/月）**：每月線上 Q&A、個人化建議、完整資源庫\n\n你有興趣了解哪個方案呢？', timestamp: daysAgo(2).toISOString() },
        { role: 'user', content: '我想加入 VIP', timestamp: daysAgo(2).toISOString() },
      ],
    },
  });
  console.log('✅ Bot config + sample conversation');

  // ─── 10. Membership Tiers ───
  await prisma.membership.deleteMany({ where: { tenantId } });
  await prisma.membershipTier.deleteMany({ where: { tenantId } });

  const tiers = [
    { name: '免費會員', description: '基本社群參與', priceMonthly: 0, priceYearly: 0, benefits: ['觀看公開影片', '參與社群討論', '每月電子報'], sortOrder: 0, botAccessTier: 'FREE' as const },
    { name: 'Pro 會員', description: '獨家內容搶先看', priceMonthly: 199, priceYearly: 1990, benefits: ['所有免費會員權益', '獨家幕後花絮', '搶先觀看新影片', '專屬 Discord 頻道', 'Pro 限定直播'], sortOrder: 1, botAccessTier: 'MEMBER' as const },
    { name: 'VIP 會員', description: '1 對 1 專屬服務', priceMonthly: 499, priceYearly: 4990, benefits: ['所有 Pro 會員權益', '每月一次線上 Q&A', '個人化創作建議', '完整教學資源庫', '優先合作機會', '實體見面會邀請'], sortOrder: 2, botAccessTier: 'PREMIUM' as const },
  ];

  const createdTiers = [];
  for (const t of tiers) {
    const tier = await prisma.membershipTier.create({
      data: {
        userId,
        tenantId,
        name: t.name,
        description: t.description,
        priceMonthly: t.priceMonthly,
        priceYearly: t.priceYearly,
        benefits: t.benefits,
        botAccessTier: t.botAccessTier,
        sortOrder: t.sortOrder,
        isActive: true,
      },
    });
    createdTiers.push(tier);
  }
  console.log('✅ 3 membership tiers');

  // ─── 11. Fan Users + Memberships ───
  // Delete existing fan users for this tenant (re-seed safe)
  const existingFans = await prisma.user.findMany({ where: { tenantId, role: 'FAN' } });
  for (const fan of existingFans) {
    await prisma.membership.deleteMany({ where: { fanUserId: fan.id } });
  }
  await prisma.user.deleteMany({ where: { tenantId, role: 'FAN' } });

  const fanNames = [
    { name: '小明', email: 'fan1@example.com' },
    { name: 'Amy Chen', email: 'fan2@example.com' },
    { name: '阿翔', email: 'fan3@example.com' },
    { name: 'Jess Wang', email: 'fan4@example.com' },
    { name: '小美', email: 'fan5@example.com' },
    { name: 'Kevin Liu', email: 'fan6@example.com' },
    { name: '怡君', email: 'fan7@example.com' },
    { name: 'Ryan Wu', email: 'fan8@example.com' },
    { name: '佩玲', email: 'fan9@example.com' },
    { name: 'David Lin', email: 'fan10@example.com' },
  ];

  // Tier distribution: 3 Free, 5 Pro, 2 VIP
  const tierDistribution = [0, 0, 0, 1, 1, 1, 1, 1, 2, 2]; // index into createdTiers

  const fanHash = await bcrypt.hash('fan12345', 12);
  for (let i = 0; i < fanNames.length; i++) {
    const fan = await prisma.user.create({
      data: {
        tenantId,
        email: fanNames[i].email,
        passwordHash: fanHash,
        displayName: fanNames[i].name,
        role: 'FAN',
        onboardingCompleted: true,
      },
    });

    const tierIdx = tierDistribution[i];
    await prisma.membership.create({
      data: {
        fanUserId: fan.id,
        creatorUserId: userId,
        tierId: createdTiers[tierIdx].id,
        tenantId,
        status: 'ACTIVE',
        currentPeriodStart: daysAgo(randomBetween(10, 60)),
        currentPeriodEnd: daysFromNow(randomBetween(5, 30)),
      },
    });
  }
  console.log('✅ 10 fan members');

  // ─── 12. Brand Deals ───
  await prisma.brandDeal.deleteMany({ where: { tenantId } });

  const deals = [
    {
      brandName: 'Samsung Taiwan',
      dealType: 'SPONSORED_POST' as const,
      status: 'COMPLETED' as const,
      budgetRange: { min: 150000, max: 200000, currency: 'TWD' },
      actualRevenue: 180000,
      notes: '合作 Galaxy S24 Ultra 開箱影片，含 YouTube 長片 + IG Reels',
      aiProposal: '# Samsung Galaxy S24 Ultra 合作提案\n\n## 合作內容\n- YouTube 深度開箱評測影片（10-15分鐘）\n- Instagram Reels 精華片段 x3\n- 限時動態宣傳 x5\n\n## 預期觸及\n- YouTube 預估觀看：50,000+\n- Instagram 觸及：120,000+\n- 總互動數：15,000+\n\n## 時程\n- 產品寄送：第1週\n- 內容製作：第2-3週\n- 發布排程：第4週',
      timelineStart: daysAgo(45),
      timelineEnd: daysAgo(15),
    },
    {
      brandName: 'LINE Today',
      dealType: 'AMBASSADOR' as const,
      status: 'IN_PROGRESS' as const,
      budgetRange: { min: 50000, max: 80000, currency: 'TWD' },
      notes: 'LINE Today 內容創作者計畫，每月產出 2 篇專欄',
      timelineStart: daysAgo(10),
      timelineEnd: daysFromNow(80),
    },
    {
      brandName: 'PChome 24h',
      dealType: 'AFFILIATE' as const,
      status: 'NEGOTIATING' as const,
      budgetRange: { min: 30000, max: 50000, currency: 'TWD' },
      notes: '雙 11 檔期聯名推薦，抽成 8%',
    },
    {
      brandName: 'ASUS ROG',
      dealType: 'PRODUCT_REVIEW' as const,
      status: 'PROPOSAL_SENT' as const,
      budgetRange: { min: 100000, max: 150000, currency: 'TWD' },
      aiProposal: '# ASUS ROG 電競筆電合作提案\n\n## 創作者資料\n- 全平台粉絲：420,000+\n- 月均觀看：800,000+\n- 科技類內容互動率：6.2%\n\n## 合作方案\n1. YouTube 深度評測影片 x1\n2. TikTok 開箱短影片 x3\n3. Instagram 使用情境圖文 x5\n\n## 為什麼選擇 Nick Creates？\n- 科技評測為頻道核心內容之一\n- 觀眾年齡 18-35 歲，與 ROG 目標客群高度重疊\n- 過往科技類影片平均觀看率達 65%',
      notes: '新款 ROG Zephyrus 評測合作',
    },
    {
      brandName: '蝦皮購物',
      dealType: 'SPONSORED_POST' as const,
      status: 'DRAFT' as const,
      budgetRange: { min: 20000, max: 40000, currency: 'TWD' },
      notes: '蝦皮超級品牌日推廣',
    },
  ];

  for (const deal of deals) {
    await prisma.brandDeal.create({
      data: {
        userId,
        tenantId,
        brandName: deal.brandName,
        dealType: deal.dealType,
        status: deal.status,
        budgetRange: deal.budgetRange,
        actualRevenue: deal.actualRevenue ?? null,
        notes: deal.notes ?? null,
        aiProposal: deal.aiProposal ?? null,
        timelineStart: deal.timelineStart ?? null,
        timelineEnd: deal.timelineEnd ?? null,
      },
    });
  }
  console.log('✅ 5 brand deals');

  // ─── 13. Affiliate Links ───
  await prisma.affiliateEvent.deleteMany({ where: { link: { tenantId } } });
  await prisma.affiliateLink.deleteMany({ where: { tenantId } });

  const affiliates = [
    { originalUrl: 'https://www.amazon.co.jp/dp/B0EXAMPLE1', productName: 'Sony A7IV 相機', trackingCode: 'nick-sony-a7iv', commissionRate: 0.04, clickCount: 1250, conversionCount: 38, revenueTotal: 45600 },
    { originalUrl: 'https://www.amazon.co.jp/dp/B0EXAMPLE2', productName: 'Rode VideoMic Pro 麥克風', trackingCode: 'nick-rode-mic', commissionRate: 0.05, clickCount: 890, conversionCount: 52, revenueTotal: 18200 },
    { originalUrl: 'https://shopee.tw/product/EXAMPLE3', productName: 'Aputure 300d 攝影燈', trackingCode: 'nick-aputure-300d', commissionRate: 0.03, clickCount: 456, conversionCount: 15, revenueTotal: 12300 },
  ];

  for (const a of affiliates) {
    await prisma.affiliateLink.create({
      data: {
        userId,
        tenantId,
        originalUrl: a.originalUrl,
        trackingCode: a.trackingCode,
        productName: a.productName,
        commissionRate: a.commissionRate,
        clickCount: a.clickCount,
        conversionCount: a.conversionCount,
        revenueTotal: a.revenueTotal,
        isActive: true,
      },
    });
  }
  console.log('✅ 3 affiliate links');

  console.log('\n🎉 Seed completed! Demo account: demo@example.com / Nick1020');
}

seed()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
