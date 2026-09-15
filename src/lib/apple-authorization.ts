type AppleAuth = {
  init(config: {
    clientId: string;
    redirectURI: string;
    state: string;
    usePopup: boolean;
  }): void;
  signIn(): Promise<{ authorization: { code: string; state: string } }>;
};

declare global {
  interface Window {
    AppleID?: { auth: AppleAuth };
  }
}

// Load before offering the authorization button: opening Apple's popup must
// happen directly in that button's click, not after a network request.
export async function loadAppleAuthorization(): Promise<AppleAuth> {
  if (window.AppleID) return window.AppleID.auth;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
    script.async = true;
    const timeout = window.setTimeout(() => finish(false), 15000);
    function finish(loaded: boolean) {
      window.clearTimeout(timeout);
      script.remove();
      if (loaded && window.AppleID) resolve();
      else reject(new Error("Apple authorization is unavailable"));
    }
    script.onload = () => finish(true);
    script.onerror = () => finish(false);
    document.head.append(script);
  });
  return window.AppleID!.auth;
}
