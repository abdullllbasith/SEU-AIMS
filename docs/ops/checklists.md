# Checklists

Items stay unchecked unless evidenced in the target environment.

## Deployment

- [ ] `npm ci` from the lockfile
- [ ] Node 20
- [ ] Production env from a secret store (not git)
- [ ] `assertProductionConfig` starts
- [ ] Mongo reachable (not public)
- [ ] Redis reachable (not public)
- [ ] Object storage not `local_dev`
- [ ] Worker process running
- [ ] TLS at the proxy
- [ ] CORS matches the frontend origin
- [ ] WhatsApp webhook URL + app secret if that channel is enabled

## Post-deployment

- [ ] `/api/health/live` 200
- [ ] `/api/health/ready` 200 (JWT present; providers may be noop)
- [ ] Student login
- [ ] Lecturer denied Study Room
- [ ] Result identity still registration + subject code
- [ ] File upload still fail-closed without scanner
- [ ] Logs show request ids, not secrets

## Rollback

- [ ] Previous artifact identified
- [ ] New processes stopped
- [ ] Previous API+worker started
- [ ] Smoke passed
- [ ] No destructive Mongo rollback
