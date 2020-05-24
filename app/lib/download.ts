/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import net from 'net';

import * as tracker from './tracker';
import * as message from './message';
import Pieces from './pieces';
import Queue from './queue';
import * as File from './file';

const onWholeMsg = (socket: net.Socket, callback: any) => {
  let savedBuf = Buffer.alloc(0);
  let handshake = true;

  socket.on('data', recvBuf => {
    // msgLen calculates the length of a whole message
    const msgLen = () =>
      handshake ? savedBuf.readUInt8(0) + 49 : savedBuf.readInt32BE(0) + 4;
    savedBuf = Buffer.concat([savedBuf, recvBuf]);

    while (savedBuf.length >= 4 && savedBuf.length >= msgLen()) {
      callback(savedBuf.slice(0, msgLen()));
      savedBuf = savedBuf.slice(msgLen());
      handshake = false;
    }
  });
};

const isHandshake = (msg: any) => {
  return (
    msg.length === msg.readUInt8(0) + 49 &&
    msg.toString('utf8', 1, 20) === 'BitTorrent protocol'
  );
};

const requestPiece = (socket: net.Socket, pieces: Pieces, queue: Queue) => {
  if (!queue.choked) {
    while (queue.length()) {
      const pieceBlock = queue.deque();
      if (pieceBlock !== undefined && pieces.needed(pieceBlock)) {
        socket.write(message.buildRequest(pieceBlock));
        pieces.addRequested(pieceBlock);
        break;
      }
    }
  }
};

const chokeHandler = (socket: net.Socket) => {
  socket.end();
};

function unchokeHandler(socket: net.Socket, pieces: any, queue: Queue) {
  // eslint-disable-next-line no-param-reassign
  queue.choked = false;
  requestPiece(socket, pieces, queue);
}

const haveHandler = (
  socket: net.Socket,
  piece: any,
  queue: Queue,
  payload: any
) => {
  const pieceIndex = payload.readInt32BE(0);
  const queueEmpty = queue.piecesQueue.length === 0;
  queue.queue(pieceIndex);
  if (queueEmpty) requestPiece(socket, piece, queue);
};

const bitfieldHandler = (
  socket: net.Socket,
  pieces: any,
  queue: Queue,
  payload: any[]
) => {
  const queueEmpty = queue.piecesQueue.length === 0;
  payload.forEach((byte, i) => {
    for (let j = 0; j < 8; j += 1) {
      if (byte % 2) queue.queue(i * 8 + 7 - j);
      // eslint-disable-next-line no-param-reassign
      byte = Math.floor(byte / 2);
    }
  });
  if (queueEmpty) requestPiece(socket, pieces, queue);
};

const pieceHandler = (
  socket: net.Socket,
  pieces: Pieces,
  queue: Queue,
  torrent: any,
  pieceResp: { index: number; begin: number; block: string | any[] }
) => {
  //  console.log("Piece received",pieceResp.index);
  pieces.addReceived(pieceResp);

  const offset =
    pieceResp.index * torrent.info['piece length'] + pieceResp.begin;
  //  fs.write(file, pieceResp.block, 0, pieceResp.block.length, offset, () => {});
  File.writeBlock(pieceResp.block, pieceResp.block.length, offset, torrent);
  if (pieces.isDone()) {
    socket.end();
    console.log('Done!');
  } else {
    requestPiece(socket, pieces, queue);
  }
};

const msgHandler = (
  msg: any,
  socket: net.Socket,
  pieces: Pieces,
  queue: Queue,
  torrent: any
) => {
  if (isHandshake(msg)) {
    //  console.log("Mesage is handshake");
    socket.write(message.buildInterested());
  } else {
    //  console.log("Not a handshake.");
    const m = message.parse(msg);

    if (m.id === 0) chokeHandler(socket);
    if (m.id === 1) unchokeHandler(socket, pieces, queue);
    if (m.id === 4) haveHandler(socket, pieces, queue, m.payload);
    if (m.id === 5) bitfieldHandler(socket, pieces, queue, m.payload);
    if (m.id === 7) pieceHandler(socket, pieces, queue, torrent, m.payload);
  }
};

const downloadFromPeer = (
  peer: { port: number; ip: string },
  torrent: any,
  pieces: Pieces
) => {
  const socket = new net.Socket();
  socket.on('error', console.log);
  socket.connect(peer.port, peer.ip, () => {
    console.log('Tcp connection established:');
    socket.write(message.buildHandshake(torrent));
  });
  const queue = new Queue(torrent);
  onWholeMsg(socket, (msg: any) =>
    msgHandler(msg, socket, pieces, queue, torrent)
  );
};

const download = (torrent: any) => {
  tracker.getPeers(torrent, (peers: any[]) => {
    const pieces = new Pieces(torrent);
    console.log('peers...', peers);

    File.openSync(torrent);
    File.speedCalculator();
    peers.forEach(peer => downloadFromPeer(peer, torrent, pieces));
  });
};

export default download;
