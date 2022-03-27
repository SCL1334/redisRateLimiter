const cache = require('./cache');

// Fixed Window / Sliding Log / Sliding Window

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
    local windowKey = math.floor(tonumber(ARGV[1]) / tonumber(ARGV[2])) * tonumber(ARGV[2])
    local noNeed = "[" .. tostring(windowKey - tonumber(ARGV[2]) - 1)
    local minNoNeed = "[0"
    redis.call('ZREMRANGEBYLEX', KEYS[1], minNoNeed, noNeed)
    -- if ip not exist, record and pass
    local exist = redis.call('exists', KEYS[1])
    if (exist == 0) then
      redis.call('zadd', KEYS[1], 1, windowKey)
      return 1
    end
  

    local preWindowKey = windowKey - tonumber(ARGV[2])
    local preCount = tonumber(redis.call('zscore', KEYS[1], preWindowKey))
    local curCountRaw = tonumber(redis.call('zscore', KEYS[1], windowKey))
    
    
    if (curCountRaw == nil) then 
      local curCount = 0
      if (preCount == nil) then
      redis.call('zadd', KEYS[1], 1, windowKey)
        if (curCount + 1 > tonumber(KEYS[2])) then
          return 0
        end
        return 1
      end
      local preWeight = 1 - (tonumber(ARGV[1]) - windowKey) / tonumber(ARGV[2])
      local quota = tonumber(KEYS[2]) - (preCount * preWeight)
      redis.call('zadd', KEYS[1], 1, windowKey)
      if (quota >= 1) then
        return 1
      else 
        return 0
      end

    else
      local curCount = curCountRaw
      if (preCount == nil) then
        redis.call('zadd', KEYS[1], curCount + 1, windowKey)
        if (curCount + 1 > tonumber(KEYS[2])) then
          return 0
        end
        return 1
      end

      local preWeight = 1 - (tonumber(ARGV[1]) - windowKey) / tonumber(ARGV[2])
      local quota = tonumber(KEYS[2]) - (preCount * preWeight) - curCount
      redis.call('zadd', KEYS[1], curCount + 1, windowKey)
      if (quota >= 1) then
        return 1
      else 
        return 0
      end
    end
    `;
    const result = await cache.eval(luaScript, 2, ip, limit, curStamp, windowMs);
    if (result === 1) { return next(); }
    const time = Date.now().toString().slice(8, 13);
    return res.status(429).json({ time, error: 'Too Many Requests' });
  };
};

const leakyBucket = function (windowSec, limit) {
  const windowMs = windowSec * 1000;
  return async function (req, res, next) {
    const ip = 'lb_ip'; // (req.ip || req.connection.remoteAddress.replace(/^.*:/, ''));
    const curStamp = Date.now();
    const luaScript = `
    local intermal = tonumber(ARGV[2]) / tonumber(KEYS[2])
    -- if ip not exist, record and pass
    local exist = redis.call('exists', KEYS[1])
    if (exist == 0) then
      redis.call('set', KEYS[1], tonumber(ARGV[1]) + intermal);
      return 1
    end
    
    -- if ip exist, check internal 
    local nextAllowTime = redis.call('get', KEYS[1])
    if ( tonumber(ARGV[1]) >= tonumber(nextAllowTime)) then
      redis.call('set', KEYS[1], tonumber(ARGV[1]) + intermal);
      return 1
    else
      return 0 
    end
    `;
    const result = await cache.eval(luaScript, 2, ip, limit, curStamp, windowMs);

    if (result === 1) { return next(); }
    const time = Date.now().toString().slice(8, 13);
    return res.status(429).json({ time, error: 'Too Many Requests' });
  };
};

const tokenBucket = function (windowSec, limit) {
  const windowMs = windowSec * 1000;
  return async function (req, res, next) {
    const ip = 'tb_ip'; // (req.ip || req.connection.remoteAddress.replace(/^.*:/, ''));
    const curStamp = Date.now();
    const luaScript = `
  
    local user = KEYS[1]
    local tokenMax = tonumber(KEYS[2])
    local curStamp = tonumber(ARGV[1])
    local windowMs = tonumber(ARGV[2])
    -- refill time
    local intermal = windowMs / tokenMax
    -- check if eixsts
    local exist = redis.call('exists', user)
    -- if no, create bucket (bucket init)
    if (exist == 0) then
      redis.call('zadd', user, tokenMax - 1, curStamp)
      return 1
    end
    -- if yes, check last visit time
    local lastVisit = tonumber(redis.call('zrange', user, 0, 0)[1])
    -- refill token base on time
    local refill = math.floor((curStamp - lastVisit) / intermal)
    -- if over limit, fix to limit
    local remainToken = redis.call('zscore', user, lastVisit)
    local newTokenNum
    if (remainToken + refill > tokenMax) then
      newTokenNum = tokenMax
    else
      newTokenNum = remainToken + refill
    end
    -- check if enough token

    -- if yes, remove token pass
    if (newTokenNum >= 1) then
      redis.call('ZREM', user, lastVisit)
      redis.call('zadd', user, newTokenNum - 1, curStamp)
      return 1
    -- if no, reject
    else 
      return 0
    end
    


    `;
    const result = await cache.eval(luaScript, 2, ip, limit, curStamp, windowMs);
    if (result === 1) { return next(); }
    const time = Date.now().toString().slice(8, 13);
    return res.status(429).json({ time, error: 'Too Many Requests' });
  };
};

module.exports = {
  fixWindow, slideLog, slideWindow, leakyBucket, tokenBucket,
};
