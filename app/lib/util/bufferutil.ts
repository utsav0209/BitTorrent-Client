/* eslint-disable prefer-rest-params */
/* eslint-disable no-bitwise */
/* eslint-disable no-param-reassign */
/* eslint-disable no-plusplus */
function concat(...args: any[]) {
  let length = 0;
  for (let i = 0; i < args.length; i++) {
    length += args[i].length;
  }
  const nb = Buffer.alloc(length);
  let pos = 0;
  for (let i = 0; i < args.length; i++) {
    const b = args[i];
    b.copy(nb, pos, 0);
    pos += b.length;
  }
  return nb;
}

function equal(b1: Buffer, b2: Buffer) {
  if (b1.length !== b2.length) {
    return false;
  }
  for (let i = 0; i < b1.length; i++) {
    if (b1[i] !== b2[i]) {
      return false;
    }
  }
  return true;
}

function fromInt(int: number) {
  const b = Buffer.alloc(4);
  b[0] = (int >> 24) & 0xff;
  b[1] = (int >> 16) & 0xff;
  b[2] = (int >> 8) & 0xff;
  b[3] = int & 0xff;
  return b;
}

function readInt(buffer: Buffer, offset?: number) {
  offset = offset || 0;
  return (
    (buffer[offset] << 24) |
    (buffer[offset + 1] << 16) |
    (buffer[offset + 2] << 8) |
    buffer[offset + 3]
  );
}

function fromInt16(int: number) {
  const b = Buffer.alloc(2);
  b[2] = (int >> 8) & 0xff;
  b[3] = int & 0xff;
  return b;
}

function readInt16(buffer: Buffer, offset?: number) {
  offset = offset || 0;
  return (buffer[offset + 2] << 8) | buffer[offset + 3];
}

function slice(buffer: Buffer, start: number, end: number) {
  if (start < 0) start = 0;
  if (!end || end > buffer.length) end = buffer.length;

  const b = Buffer.alloc(end - start);
  buffer.copy(b, 0, start, end);
  return b;
}

export { concat, equal, fromInt, readInt, fromInt16, readInt16, slice };
