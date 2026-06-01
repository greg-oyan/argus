interface AladinLiteSource {
  ra?: number;
  dec?: number;
  data?: Record<string, unknown>;
}

interface AladinLiteCatalog {
  addSources?: (sources: AladinLiteSource[]) => void;
}

interface AladinLiteInstance {
  addCatalog?: (catalog: AladinLiteCatalog) => void;
  gotoRaDec?: (ra: number, dec: number) => void;
  setFoV?: (fov: number) => void;
  remove?: () => void;
}

interface AladinLiteGlobal {
  init?: Promise<void>;
  aladin: (
    selectorOrElement: string | HTMLElement,
    options?: Record<string, unknown>,
  ) => AladinLiteInstance;
  catalog?: (options?: Record<string, unknown>) => AladinLiteCatalog;
  source?: (ra: number, dec: number, data?: Record<string, unknown>) => AladinLiteSource;
}

interface Window {
  A?: AladinLiteGlobal;
}
