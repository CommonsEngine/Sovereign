// The platform DB singleton (bootstrap + seeding) lives in @sovereignfs/db so
// the SDK and tests share one implementation. Re-exported here so runtime
// code keeps a stable local import path.
export { getPlatformDb } from '@sovereignfs/db';
