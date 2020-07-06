/* eslint-disable no-restricted-syntax */
/* eslint-disable guard-for-in */
/* eslint-disable no-param-reassign */
/* eslint-disable @typescript-eslint/no-use-before-define */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import ParseTorrent from 'parse-torrent';

// import LOAD_ERROR from 'load_error';
import EventEmitter from 'events';
import ProcessUtils from './util/processutils';
import BitField from './util/bitfield';
import * as BufferUtils from './util/bufferutil';
import File from './torfile';
import Message from './tormessage';
import Peer from './torpeer';
import Piece from './torpiece';
// eslint-disable-next-line import/no-cycle
import Tracker from './tracker/tracker';

const LOGGER = require('log4js').getLogger('torrent.js');

class Torrent extends EventEmitter {
  pieceLength = 0;

  clientId: any;
  port: number;

  downloadPath: any;

  downloaded = 0;
  uploaded = 0;

  leechers = 0;
  seeders = 0;

  torrent: any;
  peers: { [id: string]: Peer } = {};
  trackers: Tracker[] = [];
  pieces: Piece[] = [];

  bitfield: BitField;
  activePieces: BitField;
  files: any = [];
  size = 0;

  status?: string;

  constructor(clientId: any, port: number, file: string, downloadPath: any) {
    super();
    this.clientId = clientId;
    this.port = port;
    this.downloadPath = downloadPath;
    this.bitfield = new BitField(0);
    this.activePieces = new BitField(0);
    parse(this, file);
  }

  addPeer(peer: Peer): void {
    if (!(peer.getIdentifier() in this.peers)) {
      this.peers[peer.getIdentifier()] = peer;
      peer.once(Peer.CONNECT, () => {
        LOGGER.debug('Torrent.addPeer [CONNECT]');
        peer.sendMessage(
          new Message(Message.BITFIELD, this.bitfield.toBuffer())
        );
      });
      peer.once(Peer.DISCONNECT, () => {
        LOGGER.debug('Torrent.addPeer [DISCONNECT]');
        // self.removePeer(peer);
      });
      peer.on(Peer.CHOKED, () => {
        LOGGER.debug('Torrent.addPeer [CHOKED]');
      });
      peer.on(Peer.READY, () => {
        ProcessUtils(() => {
          peerReady(this, peer);
        });
      });
      peer.on(Peer.UPDATED, () => {
        const interested =
          peer.bitfield.xor(peer.bitfield.and(this.bitfield)).setIndices()
            .length > 0;
        LOGGER.debug(`Torrent.addPeer [UPDATED] interested = ${interested}`);
        peer.setAmInterested(interested);
      });
    }
  }

  calculateDownloadRate(): number {
    let rate = 0;
    for (const id in this.peers) {
      rate += this.peers[id].currentDownloadRate;
    }
    return rate;
  }

  calculateUploadRate(): number {
    let rate = 0;
    for (const id in this.peers) {
      rate += this.peers[id].currentUploadRate;
    }
    return rate;
  }

  listPeers(): any[] {
    const peers = [];
    for (const id in this.peers) {
      const peer = this.peers[id];
      peers.push({
        address: peer.address,
        choked: peer.choked,
        requests: peer.numRequests,
        downloadRate: peer.currentDownloadRate,
        uploadRate: peer.currentUploadRate
      });
    }
    return peers;
  }

  listTrackers(): any {
    const trackers = [];
    for (let i = 0; i < this.trackers.length; i += 1) {
      const tracker = this.trackers[i];
      trackers.push({
        state: tracker.state,
        error: tracker.errorMessage
      });
    }
    return trackers;
  }

  removePeer(peer: Peer): void {
    peer.removeAllListeners(Peer.CHOKED);
    peer.removeAllListeners(Peer.CONNECT);
    peer.removeAllListeners(Peer.DISCONNECT);
    peer.removeAllListeners(Peer.READY);
    peer.removeAllListeners(Peer.UPDATED);
    delete this.peers[peer.getIdentifier()];
  }

  requestChunk(index: number, begin: number, length: number, cb: any) {
    const piece = this.pieces[index];
    if (piece) {
      piece.getData(begin, length, (data: any) => {
        this.uploaded += data && data.length ? data.length : 0;
        cb(data);
      });
    } else {
      cb();
    }
  }

  start(): void {
    for (let i = 0; i < this.trackers.length; i += 1) {
      this.trackers[i].start(
        ((tracker: any) => {
          return (data: any) => {
            trackerUpdated(this, tracker, data);
          };
        })(this.trackers[i])
      );
    }
  }

  stop(): void {
    for (let i = 0; i < this.trackers.length; i += 1) {
      this.trackers[i].stop(() => {});
    }
    for (const id in this.peers) {
      const peer = this.peers[id];
      peer.disconnect('Torrent stopped.');
    }
  }

  trackerInfo(): any {
    return {
      info_hash: this.torrent.info_hash,
      peer_id: this.clientId,
      port: this.port,
      uploaded: 0,
      downloaded: this.downloaded,
      left: this.size
    };
  }
}

function createFiles(self: Torrent, torrent: any, cb: any) {
  self.files = [];
  if (torrent.info.length) {
    const { length } = torrent.info;
    self.files.push(
      new File(
        path.join(self.downloadPath, self.torrent.info.name),
        length,
        0,
        (err: Error) => {
          if (err) {
            throw new Error(`Error creating file, err = ${err}`);
          }
          self.size = length;
          cb();
        }
      )
    );
  } else {
    const basePath = path.join(self.downloadPath, self.torrent.name);
    fs.exists(basePath, (exists: any) => {
      function doCreate() {
        const { files } = torrent;
        self.size = 0;
        let offset = 0;
        (function nextFile() {
          if (files.length === 0) {
            cb();
          } else {
            const file = files.shift();
            (function checkPath(curPath, pathArr) {
              self.files.push(
                new File(
                  path.join(curPath, pathArr),
                  file.length,
                  offset,
                  (err: Error) => {
                    if (err) {
                      throw new Error(`Error creating file, err = ${err}`);
                    }
                    self.size += file.length;
                    offset += file.length;
                    ProcessUtils(nextFile);
                  }
                )
              );
            })(basePath, file.name);
          }
        })();
      }
      if (!exists) {
        fs.mkdir(basePath, 0o777, err => {
          if (err) {
            throw new Error(`Couldn't create directory. err = ${err}`);
          }
          doCreate();
        });
      } else {
        doCreate();
      }
    });
  }
}

function createPieces(self: Torrent, hashes: any, cb: any) {
  self.pieces = [];
  const numPieces = hashes.length;
  let index = 0;
  // eslint-disable-next-line no-constant-condition
  while (1) {
    if (index === numPieces) {
      LOGGER.debug(
        `Finished validating pieces.  Number of valid pieces = ${self.bitfield.cardinality()} out of a total of ${
          self.bitfield.length
        }`
      );
      cb(self.bitfield.cardinality() === self.bitfield.length);
    } else {
      const hash = hashes[index];
      let { pieceLength } = self;
      if (index === numPieces - 1) {
        pieceLength = self.size % self.pieceLength;
      }
      const piece = new Piece(
        index,
        index * self.pieceLength,
        pieceLength,
        hash,
        self.files,
        (isComplete: boolean, indx: number) => {
          if (isComplete) {
            self.bitfield.set(indx);
          } else {
            // piece.once(Piece.COMPLETE, () => {
            //   pieceComplete(self, piece);
            // });
          }
          // index += 1;
          // create();
        }
      );
      // piece.once(Piece.COMPLETE, () => {
      //   pieceComplete(self, piece);
      // });
      self.pieces[index] = piece;
    }
    index += 1;
  }
}

function createTrackers(self: Torrent, announce: any, announceList: any) {
  self.trackers = [];

  for (const j in self.torrent.announceList) {
    self.trackers.push(new Tracker(j, self));
  }
}

function parse(self: Torrent, data: any) {
  self.torrent = ParseTorrent(fs.readFileSync(data));
  self.pieceLength = self.torrent.pieceLength;
  // const hash = crypto
  //   .createHash('sha1')
  //   .update(self.torrent.info)
  //   .digest();
  // self.infoHash = Buffer.from(hash);

  self.bitfield = new BitField(self.torrent.info.pieces.length / 20);
  self.activePieces = new BitField(self.bitfield.length);

  createTrackers(self, self.torrent.announce, self.torrent.announceList);

  createFiles(self, self.torrent, () => {
    createPieces(self, self.torrent.pieces, (complete: boolean) => {
      // eslint-disable-next-line no-empty
      if (!complete) {
      } else {
        LOGGER.info('torrent already complete');
      }
      self.emit('ready');
    });
  });
}

function peerReady(self: Torrent, peer: Peer) {
  const activePieces = self.activePieces.setIndices();
  let piece;
  for (let i = 0; i < activePieces.length; i += 1) {
    const index = activePieces[i];
    const p = self.pieces[index];
    if (peer.bitfield.isSet(index) && !p.hasRequestedAllChunks()) {
      piece = p;
      break;
    }
  }
  if (!piece) {
    const available = peer.bitfield.xor(
      peer.bitfield.and(self.activePieces.or(self.bitfield))
    );

    const set = available.setIndices();
    const index = set[Math.round(Math.random() * (set.length - 1))];
    if (index !== undefined) {
      piece = self.pieces[index];
      self.activePieces.set(index);
    }
  }
  if (piece) {
    LOGGER.debug(`peer ready, requesting piece ${piece.index}`);
    peer.requestPiece(piece);
  } else if (peer.numRequests === 0) {
    LOGGER.debug(`No available pieces for peer ${peer.getIdentifier()}`);
    peer.setAmInterested(false);
  }
}

function pieceComplete(self: Torrent, piece: Piece) {
  LOGGER.debug(`Piece complete, piece index = ${piece.index}`);
  piece.isValid((valid: boolean) => {
    if (valid) {
      self.bitfield.set(piece.index);
      self.downloaded += piece.length;

      self.emit('progress', self.bitfield.cardinality() / self.bitfield.length); // when more file is down...

      if (self.bitfield.cardinality() === self.bitfield.length) {
        LOGGER.info('torrent download complete');
        self.emit('complete');
      }

      const have = new Message(Message.HAVE, BufferUtils.fromInt(piece.index));
      for (const i in self.peers) {
        const peer = self.peers[i];
        if (peer.initialised) {
          peer.sendMessage(have);
        }
      }
    } else {
      LOGGER.info('Invalid piece received.');
    }
    self.activePieces.unset(piece.index);
  });
}

function trackerUpdated(self: Torrent, tracker: Tracker, data: any) {
  const { seeders } = data;
  if (tracker.seeders) {
    self.seeders -= tracker.seeders;
  }
  tracker.seeders = seeders;
  if (tracker.seeders) {
    self.seeders += tracker.seeders;
  }

  const { leechers } = data;
  if (tracker.leechers) {
    self.leechers -= tracker.leechers;
  }
  tracker.leechers = leechers;
  if (tracker.leechers) {
    self.leechers += tracker.leechers;
  }

  if (data.peers) {
    for (let i = 0; i < data.peers.length; i += 1) {
      const peer = data.peers[i];
      if (!self.peers[peer.getIdentifier()]) {
        self.addPeer(new Peer(peer.ip, peer.port, self)); // TODO: stop passing full torrent through to peer
      }
    }
  }
  self.emit('updated');
}

export default Torrent;
