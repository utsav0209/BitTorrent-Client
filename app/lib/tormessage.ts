import * as BufferUtils from './util/bufferutil';

class Message {
  code: number;
  payload: Buffer;
  PORT = 9;

  static readonly KEEPALIVE = -1;
  static readonly CHOKE = 0;
  static readonly UNCHOKE = 1;
  static readonly INTERESTED = 2;
  static readonly UNINTERESTED = 3;
  static readonly HAVE = 4;
  static readonly BITFIELD = 5;
  static readonly REQUEST = 6;
  static readonly PIECE = 7;
  static readonly CANCEL = 8;
  static readonly PORT = 9;

  constructor(code: number, payload?: Buffer) {
    this.code = code;
    this.payload = payload || Buffer.alloc(0);
  }

  writeTo(stream: any): void {
    if (this.code === Message.KEEPALIVE) {
      stream.write(BufferUtils.fromInt(0));
    } else {
      const length = 1 + (this.payload ? this.payload.length : 0);
      stream.write(BufferUtils.fromInt(length));

      const code = Buffer.alloc(1);
      code[0] = this.code;
      stream.write(code);

      if (this.payload) {
        stream.write(this.payload);
      }
    }
  }
}

export default Message;
