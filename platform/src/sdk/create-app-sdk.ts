import { sovereign } from "../../../packages/sdk/src";

interface CreateAppSdkInput {
  appId: string;
}

export function createAppSdk(_input: CreateAppSdkInput) {
  return sovereign;
}
