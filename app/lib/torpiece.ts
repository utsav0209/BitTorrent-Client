/* eslint-disable no-param-reassign */
/* eslint-disable no-global-assign */
/* eslint-disable no-restricted-globals */
import crypto from 'crypto';

import EventEmitter from 'events';
import ProcessUtils from './util/processutils';
import BitField from './util/bitfield';
import * as BufferUtils from './util/bufferutil';
import File from './torfile';

const LOGGER = require('log4js').getLogger('piece.js');

class Piece extends EventEmitter {
  static readonly CHUNK_LENGTH = 16384;
  static readonly COMPLETE = 'complete';
  static readonly INCOMPLETE = 'incomplete';

  state: any;
  complete: BitField;
  index: number;
  hash: any;
  files: any;
  length: number;
  offset: number;
  requested: BitField;
  data: any;

  constructor(
    index: number,
    offset: number,
    length: number,
    hash: any,
    files: any,
    callback: any
  ) {
    super();
    this.complete = new BitField(Math.ceil(length / Piece.CHUNK_LENGTH));
    this.files = [];
    this.hash = hash;
    this.index = index;
    this.length = length;
    this.offset = offset;
    this.requested = new BitField(this.complete.length);
    this.setMaxListeners(this.requested.length);

    this.data = null;

    let lastMatch = File.NONE;
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const match = file.contains(this.offset, this.length);
      if (
        match === File.FULL ||
        (match === File.PARTIAL && lastMatch === File.PARTIAL)
      ) {
        this.files.push(file);
      } else if (match === File.PARTIAL) {
        this.files.push(file);
      }
      lastMatch = match;

      this.isValid((valid: boolean) => {
        if (valid) {
          this.setState(Piece.COMPLETE);
        } else {
          this.setState(Piece.INCOMPLETE);
        }
        callback(this.isComplete(), index);
      });
    }
  }

  // eslint-disable-next-line class-methods-use-this
  getData(
    begin: number,
    length: number,
    cb: { (data: any): void; (arg0: Buffer | Error): void }
  ): void {
    let data = Buffer.alloc(0);
    const { offset } = this;
    const { files } = this;
    (function next() {
      if (files.length === 0) {
        cb(data);
      } else {
        const file = files.shift();
        file.read(offset + begin, length, (match: any, chunk: any) => {
          if (match instanceof Error) {
            cb(match);
          } else {
            if (match === File.FULL || match === File.PARTIAL) {
              data = BufferUtils.concat(data, chunk);
            }
            // LOGGER.debug("piece.getData: nextTick next");
            ProcessUtils(next);
          }
        });
      }
    })();
  }

  cancelRequest(begin: number): void {
    const index = begin / Piece.CHUNK_LENGTH;
    this.requested.unset(index);
  }

  hasRequestedAllChunks(): boolean {
    return this.requested.cardinality() === this.requested.length;
  }

  isComplete(): boolean {
    return this.state === Piece.COMPLETE;
  }

  // let validateCallCount = 0;
  // let validateNoCount = 0;
  // let validateYesCount = 0;

  validateData(data: any, cb: any): void {
    const dataHash = crypto
      .createHash('sha1')
      .update(data)
      .digest();
    cb(this.hash === dataHash);
  }

  isValid(cb: any): void {
    // LOGGER.debug("Piece.isValid");
    this.getData(0, this.length, (data: any) => {
      if (data instanceof Error) {
        cb(data);
      } else {
        this.validateData(data, cb);
      }
    });
  }

  nextChunk(): any {
    // TODO: end game process - multiple requests for chunks, cancel once received.

    if (this.state === Piece.COMPLETE) {
      return null;
    }

    const indices = this.requested.or(this.complete).unsetIndices();
    if (indices.length === 0) {
      return null;
    }
    this.requested.set(indices[0]);

    if (
      indices[0] === this.complete.length - 1 &&
      this.length % Piece.CHUNK_LENGTH > 0
    ) {
      const length = this.length % Piece.CHUNK_LENGTH;
    } else {
      length = Piece.CHUNK_LENGTH;
    }
    return {
      begin: indices[0] * Piece.CHUNK_LENGTH,
      length
    };
  }

  setData(data: any, begin: number, cb: any): void {
    const index = begin / Piece.CHUNK_LENGTH;

    function flushData(self: Piece, files: any) {
      if (files.length === 0) {
        self.setState(Piece.COMPLETE);
        self.data = null;
        cb();
      } else {
        const file = files.shift();
        file.write(self.offset, self.data, (match: any) => {
          if (match instanceof Error) {
            // Solve this err to match problem.
            cb(match);
          } else {
            // LOGGER.debug("piece.setData: nextTick next");
            ProcessUtils(flushData);
          }
        });
      }
    }

    if (!this.complete.isSet(index)) {
      const files = this.files.slice(0);

      this.data = this.data || Buffer.alloc(this.length);
      data.copy(this.data, begin);

      this.complete.set(index);
      if (this.complete.cardinality() === this.complete.length) {
        this.validateData(this.data, (valid: boolean) => {
          if (valid) {
            flushData(this, files);
          } else {
            LOGGER.debug('invalid piece data received, clearing.');
            this.complete = new BitField(this.complete.length);
            this.requested = new BitField(this.complete.length);
            this.data = null;
            cb();
          }
        });
      } else {
        cb();
      }
    } else {
      LOGGER.warn(`Attempt to overwrite data at ${this.offset}.`);
      cb();
    }
  }

  setState(state: string) {
    this.state = state;
    this.emit(state);
  }
}

export default Piece;
