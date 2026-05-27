import {
  getBlocks,
  getEntities,
  getInfo,
  getLayers,
  getThumbnail,
  type LoadOptions,
  loadDrawing,
  toJson,
  toSvg,
} from "./core/drawing.js";
import {
  editWithLibreDwgFilter,
  getLibreDwgStatus,
  type LibreDwgEditResult,
  type LibreDwgStatus,
  type LibreDwgViewResult,
  renderSvgWithLibreDwg,
} from "./core/libredwg.js";
import {
  type DwgSearchOptions,
  type DwgSearchResult,
  searchDrawing,
} from "./core/search.js";
import type {
  DwgBlock,
  DwgDocument,
  DwgEntity,
  DwgLayer,
  DwgParser,
  DwgSummary,
  EntityFilter,
  SvgResult,
  ThumbnailResult,
} from "./types.js";

export class Dwg {
  constructor(
    readonly file: string,
    private readonly opts: LoadOptions = {},
  ) {}

  document(): Promise<DwgDocument> {
    return loadDrawing(this.file, this.opts);
  }

  info(): Promise<DwgSummary> {
    return getInfo(this.file, this.opts);
  }

  layers(): Promise<DwgLayer[]> {
    return getLayers(this.file, this.opts);
  }

  blocks(): Promise<DwgBlock[]> {
    return getBlocks(this.file, this.opts);
  }

  entities(filter?: EntityFilter): Promise<DwgEntity[]> {
    return getEntities(this.file, filter, this.opts);
  }

  search(opts?: DwgSearchOptions): Promise<DwgSearchResult[]> {
    return searchDrawing(this.file, opts, this.opts);
  }

  json(): Promise<DwgDocument> {
    return toJson(this.file, this.opts);
  }

  svg(): Promise<SvgResult> {
    return toSvg(this.file, this.opts);
  }

  view(): LibreDwgViewResult {
    return renderSvgWithLibreDwg(this.file);
  }

  edit(opts: {
    output: string;
    expression: string;
    overwrite?: boolean;
  }): LibreDwgEditResult {
    return editWithLibreDwgFilter({
      input: this.file,
      output: opts.output,
      expression: opts.expression,
      overwrite: opts.overwrite,
    });
  }

  thumbnail(): Promise<ThumbnailResult> {
    return getThumbnail(this.file, this.opts);
  }

  static open(file: string, opts?: LoadOptions): Dwg {
    return new Dwg(file, opts);
  }

  static withParser(parser: DwgParser, file: string): Dwg {
    return new Dwg(file, { parser });
  }

  static backend(): LibreDwgStatus {
    return getLibreDwgStatus();
  }
}
