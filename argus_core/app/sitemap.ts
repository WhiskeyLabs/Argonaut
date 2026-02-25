import { MetadataRoute } from 'next';
import { siteConfig } from '@/data/config/site.settings';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = siteConfig.siteUrl;

  const routes = ['', 'overview', 'tags'].map((route) => ({
    url: `${siteUrl}/${route}`,
    lastModified: new Date().toISOString().split('T')[0],
  }));

  return [...routes];
}
