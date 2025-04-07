import Redis from 'ioredis';

const redisClient = new Redis({
    host: process.env.REDIS_HOST,  
    port: process.env.REDIS_PORT || 6379,        
    password: process.env.REDIS_PASSWORD,   
    tls: {
    rejectUnauthorized: false, 
  }           
});


redisClient.on('connect', () => {
  console.log('Connected to Redis Cloud');
});


redisClient.on('error', (err) => {
  console.error('Redis error:', err);
});






module.exports = redisClient;