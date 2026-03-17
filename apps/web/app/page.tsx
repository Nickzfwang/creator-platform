import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <h1 className="text-xl font-bold">Creator Platform</h1>
          <nav className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              登入
            </Link>
            <Link
              href="/login"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              免費開始
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center">
        <section className="container flex flex-col items-center gap-8 py-24 text-center">
          <h2 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Creator Platform
          </h2>
          <p className="max-w-2xl text-xl text-muted-foreground">
            AI 驅動的創作者變現工具
          </p>
          <p className="max-w-xl text-muted-foreground">
            整合影片管理、智慧排程、AI 聊天機器人、會員訂閱與品牌合作，
            幫助創作者最大化收益並建立可持續的事業。
          </p>
          <div className="flex gap-4">
            <Link
              href="/login"
              className="rounded-md bg-primary px-8 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              立即開始
            </Link>
            <Link
              href="#features"
              className="rounded-md border px-8 py-3 text-sm font-medium hover:bg-accent"
            >
              了解更多
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container text-center text-sm text-muted-foreground">
          &copy; 2024 Creator Platform. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
