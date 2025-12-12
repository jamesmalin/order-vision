import https from 'https';
import fs from 'fs';

const files = [
    {
        "FileName": "henryschine.pdf",
        "Url": "https://order-vision-ai-dev.s3.us-east-2.amazonaws.com/uploads/1743732000000/henryschine.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAY6BBM3Y2QBHFWLCX%2F20251117%2Fus-east-2%2Fs3%2Faws4_request&X-Amz-Date=20251117T233623Z&X-Amz-Expires=300&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEPD%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLWVhc3QtMiJHMEUCIQDy0LQf%2BhFZtQdNVJ%2BOsaHiCWWHy8hwBT21HX5TihTcMgIgXBEAuOfMc2Z5dx5L%2FSRR4iIfmwrUNTc5XPEXBmGKLwwqgwMIuf%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARABGgw2MTQyNTAzNzI2NjEiDNWiVt9D0wnBu3sL%2BirXAvzuxJeca65YWh%2Bt8w1DpewfKWGhuItkE75P2OSEa%2F4flBvG1HcbRx6qNX%2Bb0kzE2YhjsK6lcaYJTjOJd%2FMh5dx5N10rjEldtjSz%2BreinfF01a6WiYh6T8%2BV7xqXqB9udgc8l564%2BfEl3jIu2IXWTKzCcMQzkMaGRhG9qpmjNzNY%2BmLeuarfcN69ZEt7DtZRMgJJzbiLH34j6GyO5Vikc2ifFsWG8gbtBLaAFV48ZKPEXpwnXMhWn9Wgf%2F46A5gmFRCWDLS8RjcBXBpQgbgpOG%2BvUUIi6AROFR3NwigopPAQUg5g4WybOV3YnQmZKayALb0g6fI2DYmiYTl6HdHMvrRZrHMrzZvCLTr4tZctdgaOvSLRXs%2Ba1Fe%2BqZs4f27MNpRvNe3z7pA2LKjJd2M3RqQS%2FwxtaRCZ%2Fh7uT%2Fg1pyA7p6TIhu%2Bgmlo1dGcLVan9r1FOU8QkojIw9eLuyAY6ngE4U91YUyUgPsEiqD%2FkSN5XnRrqCPH7izf1p3ziJWqO3ph0bAyGtzqV%2BQtuI5EusrlKHZNe%2FcCqO%2BOWrLQBbHQDD5RT8AZRlR6vGqY%2FolKqJIjmBj7lKw4NCQWsqLuwedrf%2Fjhh6Ib%2F873ln65oKAvwghKft4vRp4vCuraL49ifuIiHjv8hI%2FcROp9UxJtPXc4LCut1NyV1AQKvgRvLZw%3D%3D&X-Amz-Signature=6fd5c3da322170c2d91a6f6d696a355e9bb8c44a1dfd2bb504a1b2d2ed8a4c0f&X-Amz-SignedHeaders=host&x-amz-checksum-crc32=AAAAAA%3D%3D&x-amz-sdk-checksum-algorithm=CRC32&x-id=PutObject",
        "FileKey": "uploads/1743732000000/henryschine.pdf"
    }
];

function getFileSize(filePath) {
    const stats = fs.statSync(filePath);
    return stats.size;
}

// Function to upload a file using HTTPS PUT
async function uploadFile(file) {
    return new Promise((resolve, reject) => {
        const fileStream = (file.FilePath) ? fs.createReadStream(file.FilePath) : fs.createReadStream(file.FileName);

        const fileSize = (file.FilePath) ? getFileSize(file.FilePath) : getFileSize(file.FileName);
        const url = new URL(file.Url);

        const options = {
            method: 'PUT',
            hostname: url.hostname,
            path: url.pathname + url.search,
            headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Length': fileSize
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(`Successfully uploaded: ${file.FileName}`);
                } else {
                    reject(`Failed to upload: ${file.FileName} - ${res.statusCode} ${responseData}`);
                }
            });
        });

        req.on('error', (err) => {
            reject(`Error uploading: ${file.FileName} - ${err.message}`);
        });

        // Pipe the file stream to the request
        fileStream.pipe(req);
    });
}

// Main function to process all files
async function processFiles(files) {
    for (const file of files) {
        try {
            const result = await uploadFile(file);
            console.log(result);
        } catch (err) {
            console.error(err);
        }
    }
}

// Execute the file upload process
processFiles(files);
