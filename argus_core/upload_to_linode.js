const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

function requiredEnv(name) {
    const value = process.env[name];
    if (!value || String(value).trim().length === 0) {
        throw new Error(`Missing required env var: ${name}`);
    }
    return String(value).trim();
}

const endpoint = requiredEnv('DEMO_OBJECTSTORE_ENDPOINT');
const accessKeyId = requiredEnv('DEMO_OBJECTSTORE_ACCESS_KEY_ID');
const secretAccessKey = requiredEnv('DEMO_OBJECTSTORE_SECRET_ACCESS_KEY');
const bucketName = requiredEnv('DEMO_OBJECTSTORE_BUCKET');

const s3Client = new S3Client({
    endpoint,
    region: 'us-east-1',
    credentials: {
        accessKeyId,
        secretAccessKey,
    }
});

async function uploadFile(filePath, objectKey, contentType) {
    const fileStream = fs.createReadStream(filePath);
    const uploadParams = {
        Bucket: bucketName,
        Key: objectKey,
        Body: fileStream,
        ACL: 'public-read',
        ContentType: contentType
    };

    try {
        const data = await s3Client.send(new PutObjectCommand(uploadParams));
        console.log(`Successfully uploaded ${objectKey} to ${bucketName}. URL: https://${bucketName}.us-east-1.linodeobjects.com/${objectKey}`);
    } catch (err) {
        console.log(`Error uploading ${objectKey}`, err);
    }
}

async function main() {
    const dashboardPath = path.join(__dirname, '../program_management/architecture/architecture_dashboard.html');
    const whyPath = path.join(__dirname, '../program_management/architecture/why.html');
    const journeyPath = path.join(__dirname, '../program_management/architecture/journey.html');
    const logoPath = path.join(__dirname, 'public/ARGUS_Logo.png');

    await uploadFile(logoPath, 'architecture/ARGUS_Logo.png', 'image/png');
    await uploadFile(dashboardPath, 'architecture/index.html', 'text/html');
    await uploadFile(whyPath, 'architecture/why.html', 'text/html');
    await uploadFile(journeyPath, 'architecture/journey.html', 'text/html');
}

main();
