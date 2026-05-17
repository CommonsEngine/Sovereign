export interface SovereignUser {
  id: string;
  displayName: string;
}

export const auth = {
  currentUser(): SovereignUser {
    return {
      id: "local-user",
      displayName: "Local User",
    };
  },
};