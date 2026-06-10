interface AladinLiteSource {
  ra?: number;
  dec?: number;
  data?: Record<string, unknown>;
}

interface AladinLiteCatalog {
  addSources?: (sources: AladinLiteSource[]) => void;
  removeAll?: () => void;
}

type AladinLiteEventName = "objectClicked" | "objectHovered" | string;

type AladinLiteEventPayload = AladinLiteSource | null | undefined;

interface AladinLiteInstance {
  addCatalog?: (catalog: AladinLiteCatalog) => void;
  gotoRaDec?: (ra: number, dec: number) => void;
  setFoV?: (fov: number) => void;
  zoomToFoV?: (fov: number, durationSeconds?: number) => void;
  setImageSurvey?: (survey: string) => void;
  on?: (eventName: AladinLiteEventName, callback: (object: AladinLiteEventPayload) => void) => void;
  world2pix?: (ra: number, dec: number) => [number, number] | null | undefined;
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
