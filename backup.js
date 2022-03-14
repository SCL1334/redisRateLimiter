const luaScript = `
-- if ip not exist, record and pass
local exist = redis.call('exists', KEYS[1])
if (exist == 0) then
  redis.call('zadd', KEYS[1], 1, ARGV[1])
  return 1
end

-- if list len < limit, push new one and pass
local len = redis.call('zcard', KEYS[1])
if (len == 1) then
  local stamp = tonumber(redis.call('zrange', KEYS[1], 0, 0)[1])
  local visit = tonumber(redis.call('zscore', KEYS[1], stamp))
  local checkFromNow = tonumber(ARGV[1]) - tonumber(ARGV[2])
  local ends = stamp + tonumber(ARGV[2])
  if (checkFromNow >= ends) then
    -- remove 1st
    redis.call('zrem', KEYS[1], stamp)
    redis.call('zadd', KEYS[1], 1, ARGV[1])
    return 1
  end
  if (tonumber(ARGV[1]) - stamp < tonumber(ARGV[2])) then
    redis.call('zadd', KEYS[1], visit+1, stamp)
    if (visit < tonumber(KEYS[2])) then
      return 1
    else
      return 0
    end
  end
  local weight = (stamp + tonumber(ARGV[2]) - tonumber(ARGV[1]) + tonumber(ARGV[2]))
  if (weight <= 0) then
    redis.call('zadd', KEYS[1], 1, ARGV[1]);
    return 1
  end
  local quota = tonumber(KEYS[2]) - (visit * weight)
  if (quota >= 1) then
    redis.call('zadd', KEYS[1], visit+1, stamp)
    return 1
  else
    redis.call('zadd', KEYS[1], visit+1, stamp)
    return 0
  end
end

local stamp1st = tonumber(redis.call('zrange', KEYS[1], 0, 0)[1])
local visit1st = tonumber(redis.call('zscore', KEYS[1], stamp1st))
local stamp2nd = tonumber(redis.call('zrange', KEYS[1], 1, 1)[1])
local visit2nd = tonumber(redis.call('zscore', KEYS[1], stamp2nd))
local end1st = stamp1st + tonumber(ARGV[2])
local end2nd = stamp2nd + tonumber(ARGV[2])
local checkFromNow = tonumber(ARGV[1]) - tonumber(ARGV[2])

if (checkFromNow >= end1st) then
  -- remove 1st 
  redis.call('zrem', KEYS[1], stamp1st)
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
// const exist = await cache.exists(ip);
  // if (exist === 0) {
  //   await cache.rPush(ip, curStamp);
  //   return next();
  // }
  // // const multi = await cache.multi();
  // const len = await cache.lLen(ip);
  // if (len >= limit) {
  //   const time = await cache.lIndex(ip, 0);
  //   if (curStamp - time >= window) {
  //     await cache.rPush(ip, curStamp);
  //     await cache.lPop(ip);
  //     return next();
  //   }
  //   return res.status(429).json({ error: 'Too Many Requests' });
  // }
  // await cache.rPush(ip, curStamp);
  // return next();

// console.log(result);

// const exist = await cache.exists(ip);
// if (exist === 0) {
//   await cache.zadd(ip, 1, curStamp);
//   return next();
// }
// const len = await cache.zcard(ip);
// if (len === 1) {
//   let [stamp] = await cache.zrange(ip, 0, 0);
//   let visit = await cache.zscore(ip, stamp);
//   stamp = parseInt(stamp);
//   visit = parseInt(visit);
//   // current in 1st window
//   if (curStamp - stamp < windowMs) {
//     if (visit < limit) {
//       await cache.zadd(ip, visit + 1, stamp);
//       return next();
//     }
//     await cache.zadd(ip, visit + 1, stamp);
//     return res.status(429).json({ error: 'Too Many Requests' });
//   }
//   // weight stamp + window - (current - window) / window
//   const quota = limit - visit * ((stamp + windowMs - curStamp + windowMs) / windowMs);
//   if (quota >= 1) {
//     await cache.zadd(ip, 1, curStamp);
//     return next();
//   }
// }
// let [stamp1st] = await cache.zrange(ip, 0, 0);
// let [stamp2nd] = await cache.zrange(ip, 1, 1);
// let visit1st = await cache.zscore(ip, stamp1st);
// let visit2nd = await cache.zscore(ip, stamp2nd);
// stamp1st = parseInt(stamp1st);
// visit1st = parseInt(visit1st);
// stamp2nd = parseInt(stamp2nd);
// visit2nd = parseInt(visit2nd);
// const end1st = stamp1st + windowMs;
// const checkFromNow = curStamp - windowMs;
// if (checkFromNow >= end1st) {
//   await cache.zrem(ip, stamp1st);

//   if (visit2nd + 1 <= limit) {
//     await cache.zadd(ip, visit2nd + 1, stamp2nd);
//     return next();
//   }
//   await cache.zadd(ip, visit2nd + 1, stamp2nd);
//   return res.status(429).json({ error: 'Too Many Requests' });
// }
// const weight = (end1st - checkFromNow) / windowMs;
// const quota = limit - (visit1st * weight) - visit2nd;
// if (quota >= 1) {
//   await cache.zadd(ip, visit2nd + 1, stamp2nd);
//   return next();
// }
// await cache.zadd(ip, visit2nd + 1, stamp2nd);
// return res.status(429).json({ error: 'Too Many Requests' });
