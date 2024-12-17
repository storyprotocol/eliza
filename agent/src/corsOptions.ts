// corsOptions.ts

import { CorsOptions } from 'cors';

function getCorsOptions(allowedOrigins: string) {
    const allowOriginsList = allowedOrigins.split(",").map((origin) => origin.trim());
    return {
        origin: (origin, callback) => {
            // Allow requests with no origin (e.g., mobile apps, curl requests)
            if (!origin) return callback(null, true);

            if (allowOriginsList.includes(origin)) {
                return callback(null, true);
            } else {
                const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
                return callback(new Error(msg), false);
            }
        },
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true, // Adjust based on your needs
    } as CorsOptions;
}

export default getCorsOptions;
