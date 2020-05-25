import dgram from 'dgram';
import { Buffer } from 'buffer';
import { parse as urlParse } from 'url';
import crypto from 'crypto';

import * as torrentParser from './torrent-parser';
import * as util from './util';

function udpSend(socket: dgram.Socket, message: Buffer, rawUrl: string) {
  const url = urlParse(rawUrl);

  if (url.port && url.host?.split(':')[0]) {
    socket.send(
      message,
      0,
      message.length,
      Number(url.port),
      url.host.split(':')[0],
      (error: any) => {
        if (error) {
          console.log(error);
        } else {
          console.log('Data sent !!!');
        }
      }
    );
  }
}

function respType(resp: Buffer): string {
  const action = resp.readUInt32BE(0);
  if (action === 0) return 'connect';
  if (action === 1) return 'announce';
  return '';
}

function buildConnReq() {
  const buf = Buffer.alloc(16);

  //  connection id
  buf.writeUInt32BE(0x417, 0);
  buf.writeUInt32BE(0x27101980, 4);

  //  action
  buf.writeUInt32BE(0, 8);

  //  transaction id
  crypto.randomBytes(4).copy(buf, 12);

  return buf;
}

function parseConnResp(resp: Buffer) {
  return {
    action: resp.readUInt32BE(0),
    transactionId: resp.readUInt32BE(4),
    connectionId: resp.slice(8)
  };
}

function buildAnnounceReq(connId: Buffer, torrent: any, port = 6881) {
  const buf = Buffer.allocUnsafe(98);

  //  connection id
  connId.copy(buf, 0);

  //  action
  buf.writeUInt32BE(1, 8);

  //  transaction id
  crypto.randomBytes(4).copy(buf, 16);

  //  info hash
  torrentParser.infoHash(torrent).copy(buf, 16);

  //  peerId
  util.genId().copy(buf, 36);

  //  downloaded
  Buffer.alloc(8).copy(buf, 56);

  //  left
  torrentParser.size(torrent).copy(buf, 64);

  //  uploaded
  Buffer.alloc(8).copy(buf, 72);

  //  event
  buf.writeUInt32BE(0, 80);

  //  ip address
  buf.writeInt32BE(0, 84);

  //  key
  crypto.randomBytes(4).copy(buf, 88);

  //  num want
  buf.writeInt32BE(-1, 92);

  //  port
  buf.writeUInt16BE(port, 96);

  return buf;
}

function parseAnnounceResp(resp: Buffer) {
  function group(iterable: Buffer, groupSize: number) {
    const groups = [];
    for (let i = 0; i < iterable.length; i += groupSize) {
      groups.push(iterable.slice(i, i + groupSize));
    }
    return groups;
  }

  return {
    action: resp.readUInt32BE(0),
    transactionId: resp.readUInt32BE(4),
    leechers: resp.readUInt32BE(8),
    seeders: resp.readUInt32BE(12),
    peers: group(resp.slice(20), 6).map(address => {
      return {
        ip: address.slice(0, 4).join('.'),
        port: address.readUInt16BE(4)
      };
    })
  };
}

const getPeers = (torrent: any, callback: any) => {
  const socket = dgram.createSocket('udp4');
  // const url = torrent.announce.toString('utf8');
  const url = 'udp://9.rarbg.com:2710/announce';

  // 1. Send Connect request
  udpSend(socket, buildConnReq(), url);

  // emits when any error occurs
  socket.on('error', error => {
    console.log(`Error: ${error}`);
    socket.close();
  });

  socket.on('message', response => {
    console.log('Response', response);
    if (respType(response) === 'connect') {
      // 2. receive and parse connect response
      const connResp = parseConnResp(response);

      // 3. send announce request
      const announceReq = buildAnnounceReq(connResp.connectionId, torrent);
      udpSend(socket, announceReq, url);
    } else if (respType(response) === 'announce') {
      // 4.parse announce response
      console.log('Announcing');
      const announceResp = parseAnnounceResp(response);
      console.log('announce Resp', announceResp);

      // 5. pass peers to callback
      callback(announceResp.peers);
    }
  });
};

// eslint-disable-next-line import/prefer-default-export
export { getPeers };
