const cache = require('./cache');

// Leaky Bucket / Fixed Window / Sliding Log / Sliding Window

const fixWindow = function (windowSec, limit) {
  return async function (req, res, next) {
    const ip = 'fw_ip';// (req.ip || req.connection.remoteAddress.replace(/^.*:/, ''));
    const visit = await cache.incr(`fw_${ip}`);
    if (visit === 1) { await cache.expire(`fw_${ip}`, windowSec); }
    if (visit > limit) {
      const time = Date.now().toString().slice(8, 13);
      return res.status(429).json({ time, error: 'Too Many Requests' });
    }
    return next();
  };
};

const slideLog = function (windowSec, limit) {
  const windowMs = windowSec * 1000;
  return async function (req, res, next) {
    const ip = 'sl_ip'; // (req.ip || req.connection.remoteAddress.replace(/^.*:/, ''));
    const curStamp = Date.now();
    const luaScript = `
    -- if ip not exist, record and pass
    local exist = redis.call('exists', KEYS[1])
    if (exist == 0) then
      redis.call('rpush', KEYS[1], ARGV[1]);
      return 1
    end
    
    -- if list len < limit, push new one and pass
    local len = redis.call('llen', KEYS[1])
    if (len < tonumber(KEYS[2])) then
      redis.call('rpush', KEYS[1], ARGV[1]);
      return 1
    end
    
    -- if list len > limit, caused by limit changing, use ltrim to fix
    if (len > tonumber(KEYS[2])) then
      redis.call('ltrim', KEYS[1], -(tonumber(KEYS[2])), -1)
    end
  
    local time = redis.call('lindex', KEYS[1], 0)

    -- if current time - oldest timestamp > window, pass 
    if (tonumber(ARGV[1]) - time > tonumber(ARGV[2])) then
      redis.call('rpush', KEYS[1], ARGV[1]);
      redis.call('lpop', KEYS[1]);
      return 1
    else
      redis.call('rpush', KEYS[1], ARGV[1]);
      redis.call('lpop', KEYS[1]);
      return 0
    end
    `;
    const result = await cache.eval(luaScript, 2, ip, limit, curStamp, windowMs);

    if (result === 1) { return next(); }
    const time = Date.now().toString().slice(8, 13);
    return res.status(429).json({ time, error: 'Too Many Requests' });
  };
};

const slideWindow = function (windowSec, limit) {
  return async function (req, res, next) {
    const windowMs = windowSec * 1000;
    const ip = 'sw_ip'; // (req.ip || req.connection.remoteAddress.replace(/^.*:/, ''));
    const curStamp = Date.now();
    const luaScript = `
    -- if ip not exist, record and pass
    local exist = redis.call('exists', KEYS[1])
    if (exist == 0) then
      redis.call('zadd', KEYS[1], 1, ARGV[1])
      return 1
    end
  
    -- check length of zset
    local len = redis.call('zcard', KEYS[1])

    if (len == 1) then
      local stamp = tonumber(redis.call('zrange', KEYS[1], 0, 0)[1])
      local visit = tonumber(redis.call('zscore', KEYS[1], stamp))
      local checkFromNow = tonumber(ARGV[1]) - tonumber(ARGV[2])
      local ends = stamp + tonumber(ARGV[2])



      if (tonumber(ARGV[1]) - stamp < tonumber(ARGV[2])) then
        -- in same window
        redis.call('zadd', KEYS[1], visit+1, stamp)
        if (visit < tonumber(KEYS[2])) then
          return 1
        else
          return 0
        end
      end

      -- current not in 1st window, create new zset
      local weight = (ends - checkFromNow) / tonumber(ARGV[2])
      -- current more than one window out of 1st window
      if (weight <= 0) then
        redis.call('zadd', KEYS[1], 1, ARGV[1]);
        return 1
      end
      -- weight > 0
      local quota = tonumber(KEYS[2]) - (visit * weight)
      if (quota >= 1) then
        redis.call('zadd', KEYS[1], 1, stamp)
        return 1
      else
        redis.call('zadd', KEYS[1], 1, stamp)
        return 0
      end
    end
  
    local stamp1st = tonumber(redis.call('zrange', KEYS[1], 0, 0)[1])
    local stamp2nd = tonumber(redis.call('zrange', KEYS[1], 1, 1)[1])
    local visit1st = tonumber(redis.call('zscore', KEYS[1], stamp1st))
    local visit2nd = tonumber(redis.call('zscore', KEYS[1], stamp2nd))
    local end1st = stamp1st + tonumber(ARGV[2])
    local end2nd = stamp2nd + tonumber(ARGV[2])
    local checkFromNow = tonumber(ARGV[1]) - tonumber(ARGV[2])
    
    if (checkFromNow >= end1st) then
      -- remove 1st 
      redis.call('zrem', KEYS[1], stamp1st)
      -- out 2nd window
      if (checkFromNow >= end2nd) then
        -- remove 2nd 
        redis.call('zrem', KEYS[1], stamp2nd)
        redis.call('zadd', KEYS[1], 1, ARGV[1])
        return 1
      else
        -- in 2nd window
        redis.call('zadd', KEYS[1], visit2nd + 1, stamp2nd)
        if (visit2nd + 1 <= tonumber(KEYS[2])) then
          return 1
        else
          return 0
        end
      end
    end
    local weight = (end1st - checkFromNow) / tonumber(ARGV[2])
    local quota = tonumber(KEYS[2]) - (visit1st * weight) - visit2nd
    redis.call('zadd', KEYS[1], visit2nd + 1, stamp2nd)
    if (quota >= 1) then
      return 1
    else 
      return 0
    end
    `;
    const result = await cache.eval(luaScript, 2, ip, limit, curStamp, windowMs);
    console.log(result);
    if (result === 1) { return next(); }
    const time = Date.now().toString().slice(8, 13);
    return res.status(429).json({ time, error: 'Too Many Requests' });
  };
};

module.exports = { fixWindow, slideLog, slideWindow };
