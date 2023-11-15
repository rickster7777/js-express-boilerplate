import redisConnection from '@tczdigital/node-utilities/cache/redis';

export const client = redisConnection({
    host: process.env['REDIS-HOST'],
    port: process.env['REDIS-PORT'],
    password: process.env['REDIS-PASSWORD'],
});
export default client;
