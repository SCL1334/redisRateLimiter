require('dotenv').config();
const Redis = require('ioredis');

const client = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  user: process.env.REDIS_USER,
  password: process.env.REDIS_PASSWORD,
});

// const client = redis.createClient({
//   host: process.env.REDIS_HOST,
//   port: process.env.REDIS_PORT,
//   user: process.env.REDIS_USER,
//   password: process.env.REDIS_PASSWORD,
// });
// client.on('error', (err) => console.log('Redis Client Error', err));
// client.connect();

module.exports = client;
