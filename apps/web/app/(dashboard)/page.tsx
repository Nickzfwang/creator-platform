export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">歡迎回來</h1>
      <p className="text-muted-foreground">
        這是您的創作者儀表板，您可以在這裡管理所有內容。
      </p>

      {/* Stats overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "總影片數", value: "0" },
          { label: "總觀看次數", value: "0" },
          { label: "訂閱會員", value: "0" },
          { label: "本月收入", value: "NT$0" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border bg-card p-6 shadow-sm"
          >
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className="mt-2 text-3xl font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Placeholder sections */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-6">
          <h3 className="mb-4 font-semibold">最近影片</h3>
          <p className="text-sm text-muted-foreground">尚無影片</p>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <h3 className="mb-4 font-semibold">即將發布</h3>
          <p className="text-sm text-muted-foreground">尚無排程</p>
        </div>
      </div>
    </div>
  );
}
