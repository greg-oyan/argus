const ALADIN_SCRIPT_URL = "https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.js";
const SCRIPT_ID = "argus-aladin-lite-script";

let aladinPromise: Promise<AladinLiteGlobal> | null = null;

function existingAladin(): AladinLiteGlobal | null {
  return window.A?.aladin ? window.A : null;
}

function waitForAladinInit(aladin: AladinLiteGlobal): Promise<AladinLiteGlobal> {
  if (!aladin.init) {
    return Promise.resolve(aladin);
  }
  return aladin.init.then(() => aladin);
}

export function loadAladinLite(): Promise<AladinLiteGlobal> {
  const available = existingAladin();
  if (available) {
    return waitForAladinInit(available);
  }
  if (aladinPromise) {
    return aladinPromise;
  }

  const promise = new Promise<AladinLiteGlobal>((resolve, reject) => {
    const existingScript = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existingScript ?? document.createElement("script");

    script.id = SCRIPT_ID;
    script.src = ALADIN_SCRIPT_URL;
    script.async = true;
    script.charset = "utf-8";

    script.addEventListener(
      "load",
      () => {
        const loaded = existingAladin();
        if (!loaded) {
          reject(new Error("Aladin Lite loaded without exposing the expected browser API."));
          return;
        }
        waitForAladinInit(loaded).then(resolve).catch(reject);
      },
      { once: true },
    );
    script.addEventListener(
      "error",
      () => reject(new Error("Aladin Lite could not be loaded.")),
      { once: true },
    );

    if (!existingScript) {
      document.head.appendChild(script);
    }
  });

  const guardedPromise = promise.catch((error) => {
    aladinPromise = null;
    throw error;
  });

  aladinPromise = guardedPromise;
  return guardedPromise;
}
