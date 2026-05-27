export type DwgFormat = "DWG" | "DXF";

export interface DwgBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface DwgEntity {
  id: string;
  type: string;
  layer?: string;
  color?: string | number;
  data: Record<string, unknown>;
}

export interface DwgLayer {
  name: string;
  entityCount: number;
  frozen?: boolean;
  locked?: boolean;
  color?: string | number;
}

export interface DwgBlock {
  name: string;
  entityCount: number;
}

export interface DwgSummary {
  file: string;
  format: DwgFormat;
  version?: string;
  counts: {
    entities: number;
    layers: number;
    blocks: number;
    unsupported: number;
  };
  bounds?: DwgBounds;
}

export interface DwgDocument {
  summary: DwgSummary;
  layers: DwgLayer[];
  blocks: DwgBlock[];
  entities: DwgEntity[];
  unsupported: DwgEntity[];
  raw: unknown;
}

export interface EntityFilter {
  type?: string;
  layer?: string;
  limit?: number;
}

export interface SvgResult {
  svg: string;
  unsupported: number;
  rendered: number;
  bounds: DwgBounds;
}

export interface ThumbnailResult {
  data: Uint8Array;
  mimeType: string;
  extension: string;
}

export interface DwgParser {
  parse(file: string, bytes: Uint8Array, format: DwgFormat): Promise<unknown>;
  thumbnail?(
    file: string,
    bytes: Uint8Array,
    format: DwgFormat,
  ): Promise<ThumbnailResult | null>;
}
