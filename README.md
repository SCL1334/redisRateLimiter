# Build Rate Limiters with Redis
## Overview
***Rate limiting*** is a strategy for limiting network traffic.  
It help to protect server / database / API from certain kinds of malicious activity, such as web crawler and ddos attack.  
Its main idea is to control the amount of requests that can be made by the requester/user in certain time period.  
The goal of rate limiting is to reduce strain on web servers and keep the service availability.  

***Redis*** is a popular and powerful in-memory data structure store, also is a great and reliable choice for caching.  
Due to its stability, high-speed and different data type, it's suitable for building rate limiters.  

***Lua*** is a powerful, efficient, lightweight, embeddable scripting language.  

>Redis can do amazing things just from redis-cli—and even more between Redis and your language of choice.  
But occasionally there are behaviors that cannot be efficiently or safely achieved with a client/server architecture—the logic needs to be run on the database layer.  
This is where Lua comes in. Lua is baked into Redis as a scripting language.  
With Lua you can execute code atomicly in Redis without transmission overhead to and from the client.  

***from*** [Redis](https://redis.com/redis-best-practices/lua-helpers/) 

Due to some operations in rate limiter, race condition may happen in high frequency visitings.  
To prevent the risk of inaccuracy, all the operations in rate limiter need guarantee in atomicity.  
However, even some of Redis commands guarantee atomicity, it's still not efficient enough.  
For instance, get data from Redis, do some operations in NodeJS, and send command to Redis or get data again and again.  
It would be better to run the operation on the database layer.  
Fortunately, here is Lua.  
Lua scripts are executed in a fully synchronous and atomic fashion and support in Redis.  
***note***: Fully synchronous and atomic fashion means it may block other operation, so the calculation in Lua script should be simple.  

## Algorithms of rate limiting
There are 5 main algorithms of rate limiting:
* Fixed Window
* Sliding Log
* Sliding Window
* Leaky Bucket  
* Token Bucket

## Setting
Use ```npm install``` for the dependencies needed.  
There are 3 route for each algorithm sample.  
I perform the race limiters as middleware in Express.   
Each function from ```rateLimiter.js``` has 2 parameter:  
1. Time period (the length of window) in seconds ```(Int)``` 
1. Limit of visiting times in the time period ```(Int)```

Run ```index.js``` to start to server, then run ```worker.js``` on different terminal to start testing.  
In the responce, the time is shown in millisecond.  
If the request from worker is accepted, the response will contain a ```data``` field.  
Otherwise, will get a ```429 error status``` with ```error``` message. 

## Fixed Window

![Fixed_Window](https://user-images.githubusercontent.com/93208804/171091596-7f3025c7-7343-42e9-9df3-986a97803134.png)

The main idea of **fixed window** is to record user (with ip, token, etc...) and count the user's visiting.  
First, set a fixed time period(window), then set the max number user can access in the time period.  
Once user's visiting exceed the limit, reject the following requests until the next window.  

### Pros  
* It's the easiest to implement.
* Use less memory.  
    Only need to store 2 items per user: user nmae (or ip ...etc) and the count of visiting in a given time window.  
* Usage in old window won't affect in the new window.  
    
### Cons
* A single burst of traffic may occurs near the boundary of 2 windows.  
    In each window it doesn't exceed the limit, but in the short period it can result huge stress visitings.  

## Sliding Log  

![Sliding_Log](https://user-images.githubusercontent.com/93208804/171091612-4a609ed7-22b6-4e5b-ac0e-ab1ed75698c7.png)

To improve the weakness in fixed window, **sliding window** record the time(with timestamp) of user visitings as log.  
With tracing the logs, it's easier to count the quota for user visiting.  
Once user making a request, we check the user's logs to check the left quota.  
At the same time, drop the oldest log and put the new one in.  
So the window will move like 'sliding'.  
If the quota has been running out, we reject the request, otherwise, accept it.  

### Pros  
* Imporve the boundary condition in fixed window.  

### Cons
* Need to store a lot of logs which would be too expensive.  

## Sliding Window

![Sliding_Window](https://user-images.githubusercontent.com/93208804/171091628-97fbe048-ccfa-4208-899b-a714838f1461.png)

**Sliding Window** is a hybrid of fixed window and sliding log.  
It tries to fix the issues in both of them.  
The main idea is, it needs up to 2 window data, the previous and the current one.  
Each request in the same window will be recored in the window's counter.  
Near the window's boundary, we'll check the previous window's counter, calculate the quota left by weights base on time.  
For instance, if the window length is 10 sec, and the quota in one window is 10 times.  
Suppose there are 2 window start at 00 sec and 10 sec, and the visiting counter of the 1st window is 10.  
If a request comes at 12 sec, the left quota is:  
```Limit(10) - previous_counter(10) * previous_weight(8/10) = 2```  
As a result, though the window is fixed but the standard will move like 'sliding' and prevent the the boundary condition in fixed window.  
At the same time, it reduce the memory consumption compare to sliding log.  

### Pros  
* Imporve the boundary condition in fixed window.  
* Improve the memory consumption in sliding log (track counter rather than logs).

### Cons
* Need to pay attention on preciseness.  
    Because it is based on precise in calculating weighted value, the preciseness will affect a lot.  

## Leacky Bucket

![Leaky_Bucket](https://user-images.githubusercontent.com/93208804/171091649-1f1a3823-095a-4687-b5bd-a99f4320cab9.png)

**Leacky Bucket** is usually used in Traffic Shaping and Rate Limiting. The main purpose of it is to convert the bursty traffic to a constant rate, just like a bucket leak. All the overflow requests will be discarded.  
Here we record each user (with ip, token, etc...) and user's visiting time to calculate what time he could access next.  
If the person keep trying to access, all the requests before next allowing would be refused.    
As a result, even the requests are more than expected, the final passing requests will be in a fixed rate.  

### Pros  
* Accurate shaping by fixing the flow at smooth and constant rate. 

### Cons
* Not flexible and efficient if there are sudden requests.

## Token Bucket  

![Token_Bucket](https://user-images.githubusercontent.com/93208804/171091662-a28c03fd-c1bf-4f9e-a946-d49f1d02d9d6.png)

**Token Bucket** is also used in Traffic Shaping and Rate Limiting. However, it is not as strict as Leaky Bucket. In contrast, it provides a buffer to retain some flexibility in burst flow.  
In **Token Bucket** , we refill the token to a bucket with fixed capacity at constant rate. If the tokens are over the  capacity, the redundant tokens wiil be discarded. Every request consumes the token in the bucket. If the bucket is empty, the request will be discarded.   
In this case, the max amount of the requests in a period of time is limited by the bucket's capacity. At the same time, token could be stored as buffer allowing burst flow. If the bucket gets empty, it is similar to Leaky Bucket, new request needs to wait for next refilling.  

### Pros  
* Retain some flexibility in sudden demands.


### Cons
* Need to pay attention on setting.  
  Although it allows burst rates, if the bucket gets empty, it could not handle the next burst rate until there are enough token refilled.





