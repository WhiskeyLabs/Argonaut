'use client';

import { Analytics, AnalyticsConfig } from '@shipixen/pliny/analytics';
import { Analytics as VercelAnalytics } from '@vercel/analytics/react';

import { siteConfig } from '@/data/config/site.settings';
import { usePrivacySettings } from '@/hooks/usePrivacySettings';

export const AnalyticsWrapper = () => {
  const { policy, isLoading } = usePrivacySettings();

  if (isLoading) {
    return <></>;
  }

  if (!policy.canUseTelemetry) {
    return <></>;
  }

  if (siteConfig.analytics && Object.keys(siteConfig.analytics).length) {
    return (
      <Analytics analyticsConfig={siteConfig.analytics as AnalyticsConfig} />
    );
  }

  if (!siteConfig.disableAnalytics) {
    return <VercelAnalytics />;
  }

  return <></>;
};
