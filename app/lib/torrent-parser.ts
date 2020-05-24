/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'fs';
import crypto from 'crypto';
import bignum from 'bignum';
import bencode from 'bencode';

const BLOCK_LEN = 2 ** 14;

const size = (torrent: any) => {
  // ...
  const dataSize = torrent.info.files
    ? torrent.info.files
        .map((file: string | any[]) => file.length)
        .reduce((a: any, b: any) => a + b)
    : torrent.info.length;
  return bignum.toBuffer(dataSize, { size: 8, endian: 'big' });
};

const pieceLen = (torrent: any, pieceIndex: number): number => {
  const totalLength = bignum.fromBuffer(size(torrent)).toNumber();
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
