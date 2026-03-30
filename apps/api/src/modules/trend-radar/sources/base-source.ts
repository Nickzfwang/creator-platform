export interface RssFeedItem {
  title: string;
  link: string;
  pubDate?: string;
  source: string;
  sourcePlatform: string;
}

export interface TrendSource {
  name: string;
  sourcePlatform: string;
  fetch(): Promise<RssFeedItem[]>;
}
