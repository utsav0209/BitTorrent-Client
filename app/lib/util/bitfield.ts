/* eslint-disable operator-assignment */
/* eslint-disable no-param-reassign */
/* eslint-disable no-bitwise */
/* eslint-disable no-plusplus */
/**
 * Object that represents a series of bits, i.e. 10001101.  Bits are stored
 * in order, left to right, for example
 *
 *   bits:  10001101
 *   index: 01234567
 */
class BitField {
  bitfield: Buffer;

  length: number;

  constructor(length: number, buffer?: Buffer) {
    this.length = length;
    if (buffer === undefined) {
      this.bitfield = Buffer.alloc(Math.ceil(this.length / 8));
      for (let i = 0; i < this.bitfield.length; i++) {
        this.bitfield[i] = 0;
      }
    } else {
      this.bitfield = buffer;
    }
  }

  set(index: number): void {
    const bit = 7 - (index % 8);
    index = Math.floor(index / 8);
    this.bitfield[index] = this.bitfield[index] | (2 ** bit);
  }

  unset(index: number): void {
    const bit = 7 - (index % 8);
    index = Math.floor(index / 8);
    const val = 2 ** bit;
    if (this.bitfield[index] & val) {
      this.bitfield[index] -= val;
    }
  }

  toBuffer(): Buffer {
    return Buffer.alloc(this.bitfield);
  }

  isSet(index: number): boolean {
    const bit = 7 - (index % 8);
    index = Math.floor(index / 8);
    return (this.bitfield[index] & (2 ** bit)) > 0;
  }

  or(rhs: BitField): BitField {
    const length = Math.min(this.length, rhs.length);
    const ret = Buffer.alloc(Math.ceil(length / 8));
    for (let i = 0; i < length; i++) {
      ret[i] = this.bitfield[i] | rhs.bitfield[i];
    }
    return new BitField(length, ret);
  }

  xor(rhs: BitField): BitField {
    const length = Math.min(this.length, rhs.length);
    const ret = Buffer.alloc(Math.ceil(length / 8));
    for (let i = 0; i < length; i++) {
      ret[i] = this.bitfield[i] ^ rhs.bitfield[i];
    }
    return new BitField(length, ret);
  }

  and(rhs: BitField): BitField {
    const length = Math.min(this.length, rhs.length);
    const ret = Buffer.alloc(Math.ceil(length / 8));
    for (let i = 0; i < length; i++) {
      ret[i] = this.bitfield[i] & rhs.bitfield[i];
    }
    return new BitField(length, ret);
  }

  cardinality(): number {
    let count = 0;
    for (let i = 0; i < this.length; i++) {
      if (this.isSet(i)) {
        count++;
      }
    }
    return count;
  }

  setIndices(): number[] {
    const set = [];
    for (let i = 0; i < this.length; i++) {
      if (this.isSet(i)) {
        set.push(i);
      }
    }
    return set;
  }

  unsetIndices(): number[] {
    const set = [];
    for (let i = 0; i < this.length; i++) {
      if (!this.isSet(i)) {
        set.push(i);
      }
    }
    return set;
  }
}

export default BitField;
