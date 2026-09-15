# Scale-out

Scale **stateless API** and **workers** independently. Do not split modules into microservices.

| Signal | Action |
|---|---|
| API CPU / latency | more API instances behind the proxy |
| Job `depth` on `/api/ops/queues` | more worker processes |
| Mongo CPU / connections | raise pool only after measuring; do not add APIs if Mongo is the bottleneck |
| Redis memory | job lists + rate-limit keys; Redis is not the academic store |

Autoscaling is **not** configured in this repository.

Capacity of 1,000+ students is an **architecture target**, not a measurement from this prompt.

## Socket.IO

Multiple API instances need the Redis adapter (wired when Redis connects). Until that is verified in the target environment, run **one** API instance for Study Room realtime, or accept missed events.
