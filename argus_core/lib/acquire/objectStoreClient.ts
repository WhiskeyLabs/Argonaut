import { GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import fs from 'node:fs';
import { Readable } from 'node:stream';

export interface ObjectStoreConfig {
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    region?: string;
}

export function buildObjectStoreClient(config: ObjectStoreConfig): S3Client {
    return new S3Client({
        region: config.region ?? 'us-east-1',
        endpoint: config.endpoint,
        forcePathStyle: true,
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
        },
    });
}

export async function assertBucketExists(client: S3Client, bucket: string): Promise<void> {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
}

export async function putObjectText(params: {
    client: S3Client;
    bucket: string;
    key: string;
    content: string;
    contentType?: string;
}): Promise<void> {
    await params.client.send(new PutObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
        Body: params.content,
        ContentType: params.contentType ?? 'application/octet-stream',
    }));
}

export async function putObjectFile(params: {
    client: S3Client;
    bucket: string;
    key: string;
    filePath: string;
    contentType?: string;
}): Promise<void> {
    await params.client.send(new PutObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
        Body: fs.createReadStream(params.filePath),
        ContentType: params.contentType ?? 'application/octet-stream',
    }));
}

export async function getObjectText(params: {
    client: S3Client;
    bucket: string;
    key: string;
}): Promise<string> {
    const response = await params.client.send(new GetObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
    }));

    return streamToString(response.Body as Readable | undefined);
}

export async function getObjectFile(params: {
    client: S3Client;
    bucket: string;
    key: string;
    destinationPath: string;
}): Promise<void> {
    const response = await params.client.send(new GetObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
    }));

    const body = response.Body as Readable | undefined;
    if (!body) {
        throw new Error(`Object body is empty for key=${params.key}`);
    }

    await streamToFile(body, params.destinationPath);
}

async function streamToString(stream: Readable | undefined): Promise<string> {
    if (!stream) {
        throw new Error('Object stream is empty.');
    }

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
}

async function streamToFile(stream: Readable, destinationPath: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const writer = fs.createWriteStream(destinationPath);
        stream.on('error', reject);
        writer.on('error', reject);
        writer.on('close', () => resolve());
        stream.pipe(writer);
    });
}
