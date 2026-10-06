# Tuya scripts

Standalone TypeScript scripts for the Tuya Cloud OpenAPI (SmartLife devices). They run with `tsx`
and read credentials from the repo-root `.env`.

```sh
cp .env.example .env   # fill in the credentials from the iot.tuya.com project
pnpm tuya scripts/tuya/check.ts
pnpm tuya scripts/tuya/devices.ts
pnpm tuya scripts/tuya/model.ts <device-id>
```

Findings, feeder DPs and open questions: [`docs/tuya-feeder.md`](../../../../docs/tuya-feeder.md).
