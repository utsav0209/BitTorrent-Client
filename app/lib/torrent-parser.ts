/* eslint-disable new-cap */
/* eslint-disable no-bitwise */
/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'fs';
import crypto from 'crypto';
import bencode from 'bencode';

const BLOCK_LEN = 2 ** 14;

const size = (torrent: any) => {
  // ...
  const dataSize = torrent.info.files
    ? torrent.info.files
        .map((file: string | any[]) => file.length)
        .reduce((a: any, b: any) => a + b)
    : torrent.info.length;
  const Buf = new Buffer.alloc(4);
  Buf[0] = (dataSize >> 24) & 0xff;
  Buf[1] = (dataSize >> 16) & 0xff;
  Buf[2] = (dataSize >> 8) & 0xff;
  Buf[3] = dataSize & 0xff;
  return Buf;
};

const pieceLen = (torrent: any, pieceIndex: number): number => {
  const totalLength = torrent.info.files
    ? torrent.info.files
        .map((file: string | any[]) => file.length)
        .reduce((a: any, b: any) => a + b)
    : torrent.info.length;
  const pieceLength = torrent.info['piece length'];

  const lastPieceLength = totalLength % pieceLength;
  const lastPieceIndex = Math.floor(totalLength / pieceLength);

  return lastPieceIndex === pieceIndex ? lastPieceLength : pieceLength;
};

const blocksPerPiece = (torrent: any, pieceIndex: number): number => {
  const pieceLength = pieceLen(torrent, pieceIndex);
  return Math.ceil(pieceLength / BLOCK_LEN);
};

const blockLen = (
  torrent: any,
  pieceIndex: number,
  blockIndex: number
): number => {
  const pieceLength = pieceLen(torrent, pieceIndex);

  const lastPieceLength = pieceLength % BLOCK_LEN;
  const lastPieceIndex = Math.floor(pieceLength / BLOCK_LEN);

  return blockIndex === lastPieceIndex ? lastPieceLength : BLOCK_LEN;
};

const open = (filepath: string) => {
  return bencode.decode(fs.readFileSync(filepath));
};

const infoHash = (torrent: any) => {
  // ...
  const info = bencode.encode(torrent.info);
  return crypto
    .createHash('sha1')
    .update(info)
    .digest();
};

export { BLOCK_LEN, size, pieceLen, blocksPerPiece, blockLen, open, infoHash };
