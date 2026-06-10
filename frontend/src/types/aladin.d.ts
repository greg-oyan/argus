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

interface AladinLiteInitOptions {
  survey?: string;
  target?: string;
  fov?: number;
  cooFrame?: string;
  projection?: string;
  showReticle?: boolean;
  showCooGrid?: boolean;
  showCooGridControl?: boolean;
  showSimbadPointerControl?: boolean;
  showFullscreenControl?: boolean;
  showLayersControl?: boolean;
  showGotoControl?: boolean;
  showShareControl?: boolean;
  showFrame?: boolean;
  showProjectionControl?: boolean;
  showZoomControl?: boolean;
  showSettingsControl?: boolean;
  showStatusBar?: boolean;
  showContextMenu?: boolean;
  [key: string]: unknown;
}

interface AladinLiteGlobal {
  init?: Promise<void>;
  aladin: (
    selectorOrElement: string | HTMLElement,
    options?: AladinLiteInitOptions,
  ) => AladinLiteInstance;
  catalog?: (options?: Record<string, unknown>) => AladinLiteCatalog;
  source?: (ra: number, dec: number, data?: Record<string, unknown>) => AladinLiteSource;
}

interface Window {
  A?: AladinLiteGlobal;
}
