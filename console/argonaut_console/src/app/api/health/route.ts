import { NextResponse } from 'next/server';
import client from '@/lib/esClient';

export async function GET() {
    try {
        const response = await client.info();
        return NextResponse.json({
            status: 'ok',
            es_cluster_name: response.cluster_name,
            es_version: response.version.number,
            message: 'Connection to Elasticsearch successful.',
        }, { status: 200 });
    } catch (error) {
        console.error('Elasticsearch connection failed:', error);
        return NextResponse.json({
            status: 'error',
            message: 'Failed to connect to Elasticsearch.',
            error: error instanceof Error ? error.message : String(error)
        }, { status: 503 });
    }
}
