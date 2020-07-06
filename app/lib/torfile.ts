/* eslint-disable @typescript-eslint/no-use-before-define */
import fs from 'fs';

class File {
  static readonly PARTIAL = 'partial';
  static readonly FULL = 'full';
  static readonly NONE = 'none';

  path: string;
  length: number;
  offset: number;

  fd: any;

  constructor(filePath: string, length: number, offset: number, cb: any) {
    this.path = filePath;
    this.length = length;
    this.offset = offset || 0;

    fs.exists(filePath, (exists: boolean) => {
      let flag: string;
      if (exists) {
        flag = 'r+';
      } else {
        flag = 'w+';
      }
      fs.open(filePath, flag, 0o666, (err, fd) => {
        this.fd = fd;
        cb(err);
      });
    });
  }

  contains(offset: number, length: number): string {
    const fileEnd = this.offset + this.length;
    const pieceEnd = offset + length;

    if (offset >= this.offset && pieceEnd <= fileEnd) {
      return File.FULL;
    }
    if (
      (this.offset >= offset && this.offset <= pieceEnd) ||
      (fileEnd >= offset && fileEnd <= pieceEnd)
    ) {
      return File.PARTIAL;
    }
    return File.NONE;
  }

  read(offset: number, length: number, callback: any): void {
    const match = this.contains(offset, length);
    if (match === File.PARTIAL || match === File.FULL) {
      const bounds = calculateBounds(this, offset, length);
      const data = Buffer.alloc(bounds.dataLength);
      fs.read(this.fd, data, 0, data.length, bounds.offset, (err: any) => {
        if (err) {
          callback(err);
        } else {
          callback(match, data);
        }
      });
    } else {
      callback(match);
    }
  }

  write(offset: number, data: any, callback: any) {
    const match = this.contains(offset, data.length);
    if (match === File.PARTIAL || match === File.FULL) {
      const bounds = calculateBounds(this, offset, data.length);
      fs.write(
        this.fd,
        data,
        bounds.dataOffset,
        bounds.dataLength,
        bounds.offset,
        err => {
          if (err) {
            callback(err);
          } else {
            callback(match);
          }
        }
      );
    } else {
      callback(match);
    }
  }
}

function calculateBounds(self: File, offset: number, length: number) {
  const dataStart = Math.max(self.offset, offset);
  const dataEnd = Math.min(self.offset + self.length, offset + length);

  return {
    dataOffset: dataStart - offset,
    dataLength: dataEnd - dataStart,
    offset: Math.max(offset - self.offset, 0)
  };
}

export default File;
