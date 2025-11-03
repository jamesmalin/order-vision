import https from 'https';
import fs from 'fs';

const files = [
        {
            "FileName": "ABC.PDF",
            "Url": "https://order-vision-ai-dev.s3.us-east-2.amazonaws.com/uploads/1743732000000/ABC.PDF?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAY6BBM3Y27BYWRC3T%2F20250923%2Fus-east-2%2Fs3%2Faws4_request&X-Amz-Date=20250923T011824Z&X-Amz-Expires=300&X-Amz-Security-Token=IQoJb3JpZ2luX2VjELH%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLWVhc3QtMiJGMEQCIBqAazfNkUEyq0XlD1T5%2BA5X%2Fj0I3HzB57MDTCmmQ1g%2FAiAmlx%2BucvscgujFZR3ZjbMz7cXVb7ABHuSBm2mfV9Gmkyr6Agg6EAEaDDYxNDI1MDM3MjY2MSIMetJaUaOw%2FmoWp1OJKtcCkmTm2Dy6mSyWA58g2VXhbnJvjhB9OfJCB%2BwLeGEpl0oD2cHC1tDqtB%2BxX8JTdrbi2O1sARruV71DiTe%2BlsvnBy4Ooz4plvC13XgW1BniyJBUCb01bOfqMbcGm5o86IBQXfSMhVfp2%2Fl6IhyC1kER3xzJb%2Fbf7HP%2F0bheaaaMTrdiRZYG1r4ayQbGa9fHDv3LwNmd%2FuNiFdUuTq11ubKxqTeveCnN2Sye%2BCY1aa6cUkbMfvHHk8UIj11Cr6dC1ngIXQCVWTXfTgcgobDxGBOnMUlruy182avvBq4FYVWpKPI2iyjetjSD7VB8BUfe4oP%2BIFYVzZeeakQkRVE3WOpsMJLJ0poWX4CDaaNYitIvYsgRjDQp7Hdo9%2FiLxQjWMtiDkO9fMZYW59BhcddEfjr%2FUkMPl9Fxmwi8Yzw5jJF4JB48nlRgLmSprjOI2jlrpfJecroVsIWQPzDV6sfGBjqfAXZ1h79lOgFDBaViU6HE1xVCTVKKzzLli0JJmq1LTxV%2FS5zI2kwhlihfHprIKVHVeLSqWFViJ7hCX48BthejQyLeUsnBwU5sFK%2Be0erBDQwbWmaRdQlwdk43%2Bga9ZpYHtw7jbZVweixyGZwOlD4Cm%2BQ%2FlOlTHdSUFxcB9dlT9tYtktDlZCMXgMkpYjhLr7FOjIRGqwZpMa80Q1wJKOo%2BFQ%3D%3D&X-Amz-Signature=e9a6d88df106b38d1ddf104d4623b3800e21fb12b4b4aaf34627ceaecdb67564&X-Amz-SignedHeaders=host&x-amz-checksum-crc32=AAAAAA%3D%3D&x-amz-sdk-checksum-algorithm=CRC32&x-id=PutObject",
            "FileKey": "uploads/1743732000000/ABC.PDF"
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
