import { buildKibanaRunDashboardUrl, buildKibanaRunLogsDiscoverUrl } from './kibanaLinks';

// Mock process.env
const originalEnv = { ...process.env };

function setupEnv() {
    process.env.KIBANA_URL = 'https://kibana.example.com';
    process.env.KIBANA_RUNS_DASHBOARD_ID = 'dashboard-123';
    process.env.KIBANA_TASKLOGS_INDEX_PATTERN_ID = 'logs-456';
    process.env.KIBANA_DEFAULT_TIME_FROM = 'now-15m';
    process.env.KIBANA_DEFAULT_TIME_TO = 'now';
    process.env.KIBANA_AUTO_REFRESH_MS = '30000';
}

function teardownEnv() {
    process.env = originalEnv;
}

function assertEquals(actual: string, expected: string, message: string) {
    if (actual === expected) {
        console.log(`✅ PASS: ${message}`);
    } else {
        console.error(`❌ FAIL: ${message}`);
        console.error(`   Expected: ${expected}`);
        console.error(`   Actual:   ${actual}`);
        process.exit(1);
    }
}

function testDashboardUrl() {
    console.log('\n--- Testing buildKibanaRunDashboardUrl ---');

    // 1. Basic runId
    const url1 = buildKibanaRunDashboardUrl('run-789');
    assertEquals(
        url1,
        'https://kibana.example.com/app/dashboards#/view/dashboard-123?_g=(filters:!(),refreshInterval:(pause:!t,value:30000),time:(from:now-15m,to:now))&_a=(query:(language:kuery,query:\'runId:"run-789"\'))',
        'Dashboard URL with basic runId'
    );

    // 2. Missing runId (unfiltered)
    const url2 = buildKibanaRunDashboardUrl(undefined);
    assertEquals(
        url2,
        'https://kibana.example.com/app/dashboards#/view/dashboard-123?_g=(filters:!(),refreshInterval:(pause:!t,value:30000),time:(from:now-15m,to:now))',
        'Dashboard URL with missing runId'
    );

    // 3. Special characters in runId (escaped for Rison)
    const url3 = buildKibanaRunDashboardUrl('run:with"quotes"');
    // Note: /^[A-Za-z0-9._:-]+$/ check should fail this and return unfiltered
    assertEquals(
        url3,
        'https://kibana.example.com/app/dashboards#/view/dashboard-123?_g=(filters:!(),refreshInterval:(pause:!t,value:30000),time:(from:now-15m,to:now))',
        'Dashboard URL with invalid runId (filtered by regex)'
    );

    // 4. Overrides
    const url4 = buildKibanaRunDashboardUrl('run123', { refreshMs: 5000, timeFrom: 'now-1h' });
    assertEquals(
        url4,
        'https://kibana.example.com/app/dashboards#/view/dashboard-123?_g=(filters:!(),refreshInterval:(pause:!t,value:5000),time:(from:now-1h,to:now))&_a=(query:(language:kuery,query:\'runId:"run123"\'))',
        'Dashboard URL with overrides'
    );
}

function testDiscoverUrl() {
    console.log('\n--- Testing buildKibanaRunLogsDiscoverUrl ---');

    // 1. Basic runId
    const url1 = buildKibanaRunLogsDiscoverUrl('run-logs');
    assertEquals(
        url1,
        'https://kibana.example.com/app/discover#/?_g=(filters:!(),refreshInterval:(pause:!f,value:0),time:(from:now-15m,to:now))&index=logs-456&_a=(query:(language:kuery,query:\'runId:"run-logs"\'))',
        'Discover URL with basic runId'
    );

    // 2. Missing runId
    const url2 = buildKibanaRunLogsDiscoverUrl(undefined);
    assertEquals(
        url2,
        'https://kibana.example.com/app/discover#/?_g=(filters:!(),refreshInterval:(pause:!f,value:0),time:(from:now-15m,to:now))&index=logs-456',
        'Discover URL with missing runId'
    );

    // 3. Invalid characters
    const url3 = buildKibanaRunLogsDiscoverUrl('run with space');
    assertEquals(
        url3,
        'https://kibana.example.com/app/discover#/?_g=(filters:!(),refreshInterval:(pause:!f,value:0),time:(from:now-15m,to:now))&index=logs-456',
        'Discover URL with invalid runId'
    );
}

try {
    setupEnv();
    testDashboardUrl();
    testDiscoverUrl();
    console.log('\n✨ All tests passed!');
} finally {
    teardownEnv();
}
