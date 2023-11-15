/* A constant variable that is used to create the API_PREFIX. */
const SERVICE_NAME = 'dummy';

/* Setting the maximum file size to 50MB. */
export const MULTER_FILE_SIZE = 52428800;

/* Setting the maximum number of API calls to 100. */
export const RATE_LIMIT_MAX_API = 100;

/* Setting the rate limit window time to 1 hour. */
export const RATE_LIMIT_WINDOW_TIME = 3600000;

export const enableCustomResponseCodes = false;

export const defaultConfig = [
    ['enableCustomResponseCodes', false],
    ['dateLocale', 'en-IN'],
    ['timeZone', 'Asia/Kolkata'],
    ['API_PREFIX', '/node/api'],
    ['SERVICE_NAME', SERVICE_NAME],
];
