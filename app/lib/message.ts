/* eslint-disable @typescript-eslint/no-explicit-any */
import { Buffer } from 'buffer';
import * as torrentParser from './torrent-parser';
import * as util from './util';

const parse = (msg: {
  length: number;
  readInt8: (arg0: number) => any;
  slice: (arg0: number) => any;
  readInt32BE: (arg0: number) => any;
}) => {
  const id = msg.length > 4 ? msg.readInt8(4) : null;
  let payload = msg.length > 5 ? msg.slice(5) : null;
  if (id === 6 || id === 7 || id === 8) {
    const rest = payload.slice(8);
    payload = {
      index: payload.readInt32BE(0),
      begin: payload.readInt32BE(4)
    };
    payload[id === 7 ? 'block' : 'length'] = rest;
  }
  return {
    size: msg.readInt32BE(0),
    id,
    payload
  };
};

const buildHandshake = (torrent: any) => {
  const buf = Buffer.alloc(68);
  //  pstrlen
  buf.writeUInt8(19, 0);
  //  pstr
  buf.write('BitTorrent protocol', 1);
  //  reserved
  buf.writeUInt32BE(0, 20);
  buf.writeUInt32BE(0, 24);
  //  info hash
  torrentParser.infoHash(torrent).copy(buf, 28);
  //  peer id
  util.genId().copy(buf, 48);
  return buf;
};

const buildKeepAlive = () => Buffer.alloc(4);

const buildChoke = () => {
  const buf = Buffer.alloc(5);
  //   length
  buf.writeUInt32BE(1, 0);
  //   id
  buf.writeUInt8(0, 4);
  return buf;
};

const buildUnchoke = () => {
  const buf = Buffer.alloc(5);
  //   length
  buf.writeUInt32BE(1, 0);
  //   id
  buf.writeUInt8(1, 4);
  return buf;
};

const buildInterested = () => {
  const buf = Buffer.alloc(5);
  //   length
  buf.writeUInt32BE(1, 0);
  //   id
  buf.writeUInt8(2, 4);
  return buf;
};

const buildUninterested = () => {
  const buf = Buffer.alloc(5);
  //   length
  buf.writeUInt32BE(1, 0);
  //   id
  buf.writeUInt8(3, 4);
  return buf;
};

const buildHave = (payload: number) => {
  const buf = Buffer.alloc(9);
  //   length
  buf.writeUInt32BE(5, 0);
  //   id
  buf.writeUInt8(4, 4);
  //   piece index
  buf.writeUInt32BE(payload, 5);
  return buf;
};

const buildBitfield = (
  bitfield: {
    copy: (arg0: Buffer, arg1: number) => void;
  },
  payload: string | any[]
) => {
  const buf = Buffer.alloc(14);
  //   length
  buf.writeUInt32BE(payload.length + 1, 0);
  //   id
  buf.writeUInt8(5, 4);
  //   bitfield
  bitfield.copy(buf, 5);
  return buf;
};

const buildRequest = (payload: {
  index: number;
  begin: number;
  length: number;
}) => {
  const buf = Buffer.alloc(17);
  //   length
  buf.writeUInt32BE(13, 0);
  //   id
  buf.writeUInt8(6, 4);
  //   piece index
  buf.writeUInt32BE(payload.index, 5);
  //   begin
  buf.writeUInt32BE(payload.begin, 9);
  //   length
  buf.writeUInt32BE(payload.length, 13);
  return buf;
};

const buildPiece = (payload: {
  block: { length: number; copy: (arg0: Buffer, arg1: number) => void };
  index: number;
  begin: number;
}) => {
  const buf = Buffer.alloc(payload.block.length + 13);
  //   length
  buf.writeUInt32BE(payload.block.length + 9, 0);
  //   id
  buf.writeUInt8(7, 4);
  //   piece index
  buf.writeUInt32BE(payload.index, 5);
  //   begin
  buf.writeUInt32BE(payload.begin, 9);
  //   block
  payload.block.copy(buf, 13);
  return buf;
};

const buildCancel = (payload: {
  index: number;
  begin: number;
  length: number;
}) => {
  const buf = Buffer.alloc(17);
  //   length
  buf.writeUInt32BE(13, 0);
  //   id
  buf.writeUInt8(8, 4);
  //   piece index
  buf.writeUInt32BE(payload.index, 5);
  //   begin
  buf.writeUInt32BE(payload.begin, 9);
  //   length
  buf.writeUInt32BE(payload.length, 13);
  return buf;
};

const buildPort = (payload: number) => {
  const buf = Buffer.alloc(7);
  //   length
  buf.writeUInt32BE(3, 0);
  //   id
  buf.writeUInt8(9, 4);
  //   listen-port
  buf.writeUInt16BE(payload, 5);
  return buf;
};

export {
  parse,
  buildHandshake,
  buildKeepAlive,
  buildChoke,
  buildUnchoke,
  buildInterested,
  buildUninterested,
  buildHave,
  buildBitfield,
  buildRequest,
  buildPiece,
  buildCancel,
  buildPort
};
