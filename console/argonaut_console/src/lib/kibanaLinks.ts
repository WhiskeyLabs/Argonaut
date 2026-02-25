/**
 * Utility functions for building kibana links statically.
 */

const KIBANA_URL = process.env.KIBANA_URL || '';

export function getKibanaDiscoverUrl(indexPatternId: string, query?: string): string {
    const queryParam = query ? `&_a=(query:(language:kuery,query:'${encodeURIComponent(query)}'))` : '';
    return `${KIBANA_URL}/app/discover#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-15m,to:now))&index=${indexPatternId}${queryParam}`;
}

export function getKibanaDashboardUrl(dashboardId: string): string {
    return `${KIBANA_URL}/app/dashboards#/view/${dashboardId}`;
}
