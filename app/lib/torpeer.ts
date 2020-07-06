/* eslint-disable no-case-declarations */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-restricted-syntax */
/* eslint-disable guard-for-in */
/* eslint-disable no-param-reassign */
import net from 'net';

import EventEmitter from 'events';
import log4js from 'log4js';
import ProcessUtils from './util/processutils';
import BitField from './util/bitfield';
import * as BufferUtils from './util/bufferutil';
import Message from './tormessage';
// import OverflowList from './util/overflowlist';
import Piece from './torpiece';

const LOGGER = log4js.getLogger('peer.js');

const BITTORRENT_HEADER = Buffer.from(
  '\x13BitTorrent protocol\x00\x00\x00\x00\x00\x00\x00\x00',
  'binary'
);
const KEEPALIVE_PERIOD = 10000;
const MAX_REQUESTS = 25;

class Peer extends EventEmitter {
  static readonly CHOKED = 'choked';
  static readonly CONNECT = 'connect';
  static readonly DISCONNECT = 'disconnect';
  static readonly READY = 'ready';
  static readonly UPDATED = 'updated';

  peerId?: string;
  choked = true;
  data = Buffer.alloc(0);
  drained = true;
  initialised = false;
  interested = false;

  messages: Message[] = [];
  pieces: Piece[] = [];

  numRequests = 0;
  requests: { [id: number]: { [id: number]: Date } } = {};

  running = false;
  stream: any;

  handshake = false;
  bitfield: any;

  downloaded = 0;
  uploaded = 0;
  downloadedHistory: { ts: number; value: number }[] = [];
  downloadRates: { ts: number; value: number }[] = [];
  currentDownloadRate = 0;
  uploadedHistory: { ts: number; value: number }[] = [];
  uploadRates: { ts: number; value: number }[] = [];
  currentUploadRate = 0;

  disconnected = false;

  keepAliveId: any;
  amInterested = false;

  port: any;
  address: any;
  torrent: any;

  constructor(stream?: any, address?: any, port?: any, torrent?: any) {
    super();
    EventEmitter.call(this);
    if (stream === undefined) {
      this.address = address;
      this.port = port;
      this.setTorrent(torrent);
    } else {
      this.stream = stream;
      this.address = this.stream.remoteAddress;
      this.port = this.stream.remotePort;
    }
  }

  connect(): void {
    if (this.stream === null) {
      LOGGER.debug(`Connecting to peer at ${this.address} on ${this.port}`);
      this.stream = net.createConnection(this.port, this.address);
      this.stream.on('connect', () => {
        onConnect(this);
      });
    }

    this.stream.on('data', (data: any) => {
      onData(this, data);
    });
    this.stream.on('drain', () => {
      onDrain(this);
    });
    this.stream.on('end', () => {
      onEnd(this);
    });
    this.stream.on('error', (e: Error) => {
      onError(this, e);
    });
  }

  getIdentifier(): string {
    return `${this.address}:${this.port}`;
  }

  disconnect(message: any, reconnectTimeout?: any): void {
    LOGGER.info(`Peer.disconnect [${this.getIdentifier()}] message =`, message);
    this.disconnected = true;
    this.stream = null;
    if (this.keepAliveId) {
      clearInterval(this.keepAliveId);
      delete this.keepAliveId;
    }
    for (const index in this.pieces) {
      const piece = this.pieces[index];
      const requests = this.requests[index];
      const keys = Object.keys(requests);
      if (requests) {
        for (let i = 0; i < keys.length; i += 1) {
          // eslint-disable-next-line radix
          piece.cancelRequest(parseInt(keys[i]));
        }
      }
    }
    this.emit(Peer.DISCONNECT);

    if (reconnectTimeout) {
      setTimeout(() => {
        this.connect();
      }, reconnectTimeout);
    }
  }

  requestPiece(piece: Piece): void {
    if (this.numRequests < MAX_REQUESTS) {
      const nextChunk = piece && piece.nextChunk();
      if (nextChunk) {
        LOGGER.debug(
          `Peer.requestPiece [${this.getIdentifier()}] requesting piece ${
            piece.index
          }, begin ${nextChunk.begin}, length ${nextChunk.length}`
        );
        if (!this.pieces[piece.index]) {
          this.pieces[piece.index] = piece;
          this.requests[piece.index] = {};
          piece.once(Piece.COMPLETE, () => {
            delete this.pieces[piece.index];
          });
        }
        this.requests[piece.index][nextChunk.begin] = new Date();
        let payload = BufferUtils.fromInt(piece.index);
        payload = BufferUtils.concat(
          payload,
          BufferUtils.fromInt(nextChunk.begin)
        );
        payload = BufferUtils.concat(
          payload,
          BufferUtils.fromInt(nextChunk.length)
        );
        const message = new Message(Message.REQUEST, payload);
        this.sendMessage(message);
        this.numRequests += 1;
      }
      this.emit(Peer.READY);
    }
  }

  sendMessage(message: Message) {
    this.messages.push(message);
    if (!this.running) {
      nextMessage(this);
    }
  }

  setAmInterested(interested: any) {
    if (interested && !this.amInterested) {
      this.sendMessage(new Message(Message.INTERESTED));
      this.amInterested = true;
      if (!this.choked) {
        this.emit(Peer.READY);
      }
    } else if (!interested && this.amInterested) {
      this.sendMessage(new Message(Message.UNINTERESTED));
      this.amInterested = false;
    }
  }

  setTorrent(torrent: any) {
    this.torrent = torrent;
    this.torrent.addPeer(this);
    this.bitfield = new BitField(torrent.bitfield.length);
    if (this.stream && !this.initialised) {
      doHandshake(this);
      this.initialised = true;
      this.sendMessage(
        new Message(Message.BITFIELD, this.torrent.bitfield.toBuffer())
      );
      this.sendMessage(new Message(Message.UNCHOKE));
    }
  }
}

function doHandshake(self: Peer) {
  const { stream } = self;
  stream.write(BITTORRENT_HEADER);
  stream.write(self.torrent.infoHash);
  stream.write(self.torrent.clientId);
  self.handshake = true;
}

function handleHandshake(self: Peer) {
  const { data } = self;
  if (data.length < 68) {
    // Not enough data.
    return;
  }
  if (!BufferUtils.equal(BITTORRENT_HEADER.slice(0, 20), data.slice(0, 20))) {
    self.disconnect(`Invalid handshake. data = ${data.toString('binary')}`);
  } else {
    const infoHash = data.slice(28, 48);
    self.peerId = data.toString('binary', 48, 68);
    self.data = BufferUtils.slice(data, 68, data.length);

    if (self.torrent) {
      self.initialised = true;
      nextMessage(self);
      self.emit(Peer.CONNECT);
    } else {
      self.emit(Peer.CONNECT, infoHash);
    }
  }
}

function nextMessage(self: Peer) {
  if (!self.disconnected && self.initialised) {
    const message = self.messages.shift();
    if (message === undefined) {
      self.running = false;
      setKeepAlive(self);
    } else if (!self.stream) {
      self.connect();
    } else {
      if (self.keepAliveId) {
        clearInterval(self.keepAliveId);
        delete self.keepAliveId;
      }
      self.running = true;
      message.writeTo(self.stream);
      ProcessUtils(() => {
        nextMessage(self);
      });
    }
  }
}

function onConnect(self: Peer) {
  self.disconnected = false;
  if (self.torrent) {
    if (!self.handshake) {
      doHandshake(self);
    } else {
      nextMessage(self);
    }
  }
}

function onData(self: Peer, data: any) {
  self.data = BufferUtils.concat(self.data, data);
  if (!self.initialised) {
    handleHandshake(self);
  } else {
    processData(self);
  }
}

function onDrain(self: Peer) {
  self.drained = true;
}

function onEnd(self: Peer) {
  LOGGER.debug(`Peer [${self.getIdentifier()}] received end`);
  self.stream = null;
  if (self.amInterested) {
    // LOGGER.debug('Peer [' + self.getIdentifier() + '] after end continuing');
    // self.choked = false;
    // self.emit(Peer.READY);
    self.disconnect('after end, reconnect', 5000);
  } else {
    self.disconnect('stream ended and no interest');
  }
}

function onError(self: Peer, e: Error) {
  self.disconnect(e.message);
}

function processData(self: Peer) {
  (function next() {
    if (self.data.length < 4) {
      LOGGER.debug(`Peer [${self.getIdentifier()}] not enough data to process`);
      // Not enough data to do anything
      nextMessage(self);
      return;
    }
    const messageLength = BufferUtils.readInt(self.data);
    if (messageLength === 0) {
      // Keep alive
      LOGGER.debug(`Peer [${self.getIdentifier()}] received keep alive`);
      self.data = BufferUtils.slice(self.data, 4, self.data.length);
      processData(self);
    } else if (self.data.length >= 4 + messageLength) {
      // Have everything we need to process a message
      const code = self.data[4];
      const payload =
        messageLength > 1 ? self.data.slice(5, messageLength + 4) : null;
      const message = payload ? new Message(code, payload) : new Message(code);

      self.data = BufferUtils.slice(
        self.data,
        messageLength + 4,
        self.data.length
      );

      switch (message.code) {
        case Message.CHOKE:
          self.choked = true;
          self.emit(Peer.CHOKED);
          break;
        case Message.UNCHOKE:
          LOGGER.debug(
            `Peer [${self.getIdentifier()}] received UNCHOKE message.`
          );
          self.choked = false;
          if (self.amInterested) {
            self.emit(Peer.READY);
          }
          break;
        case Message.INTERESTED:
          self.interested = true;
          break;
        case Message.UNINTERESTED:
          self.interested = false;
          break;
        case Message.HAVE: {
          const piece = BufferUtils.readInt(message.payload);
          self.bitfield.set(piece);
          self.emit(Peer.UPDATED);
          break;
        }
        case Message.BITFIELD:
          self.bitfield = new BitField(
            self.torrent.bitfield.length,
            message.payload
          ); // TODO: figure out nicer way of handling bitfield lengths
          self.emit(Peer.UPDATED);
          break;
        case Message.REQUEST: {
          const index = BufferUtils.readInt(message.payload);
          const begin = BufferUtils.readInt(message.payload, 4);
          const length = BufferUtils.readInt(message.payload, 8);
          LOGGER.debug(
            `Chunk requested at index = ${index}, begin = ${begin}, length = ${length}`
          );
          self.torrent.requestChunk(index, begin, length, (data: any) => {
            if (data) {
              self.sendMessage(
                new Message(
                  Message.PIECE,
                  BufferUtils.concat(
                    BufferUtils.fromInt(index),
                    BufferUtils.fromInt(begin),
                    data
                  )
                )
              );
              self.uploaded += data.length;
              updateRates(self, 'up');
            } else {
              LOGGER.debug(
                `No data found for request, index = ${index}, begin = ${begin}`
              );
            }
          });
          break;
        }
        case Message.PIECE: {
          self.numRequests -= 1;
          const index = BufferUtils.readInt(message.payload);
          const begin = BufferUtils.readInt(message.payload, 4);
          const data = message.payload.slice(8);

          if (self.requests[index] && self.requests[index][begin]) {
            // const requestTime = new Date() - self.requests[index][begin];
            self.downloaded += data.length;
            delete self.requests[index][begin];
            updateRates(self, 'down');
            LOGGER.debug(
              `Peer [${self.getIdentifier()}] download rate = ${self.currentDownloadRate /
                1024}Kb/s`
            );
          }

          const piece = self.pieces[index];
          if (piece) {
            piece.setData(data, begin, () => {
              self.requestPiece(piece);
            });
          } else {
            LOGGER.info('chunk received for inactive piece');
          }
          break;
        }
        case Message.CANCEL:
          LOGGER.info('Ignoring CANCEL');
          break;
        case Message.PORT:
          LOGGER.info('Ignoring PORT');
          break;
        default:
          self.disconnect('Unknown message received.');
      }
      ProcessUtils(next);
    }
  })();
}

function setKeepAlive(self: Peer) {
  if (!self.keepAliveId) {
    self.keepAliveId = setInterval(() => {
      LOGGER.debug('keepAlive tick');
      if (self.stream && self.stream.writable) {
        const message = new Message(Message.KEEPALIVE);
        message.writeTo(self.stream);
      } else {
        clearInterval(self.keepAliveId);
      }
    }, KEEPALIVE_PERIOD);
  }
}

// calculate weighted average upload/download rate
function calculateRate(self: Peer, kind: string) {
  const isUpload = kind === 'up';

  const rates = isUpload ? self.uploadRates : self.downloadRates;

  // calculate weighted average rate
  const decayFactor = 0.13863;
  let rateSum = 0;
  let weightSum = 0;
  for (let idx = 0; idx < rates.length; idx += 1) {
    const age = rates[idx].ts - rates[0].ts;
    const weight = Math.exp((-decayFactor * age) / 1000);
    rateSum += rates[idx].value * weight;
    weightSum += weight;
  }
  const rate = rates.length > 0 ? rateSum / weightSum : 0;

  if (isUpload) {
    self.currentUploadRate = rate;
  } else {
    self.currentDownloadRate = rate;
  }
}

function updateRates(self: Peer, kind: string) {
  const isUpload = kind === 'up';

  const history = isUpload ? self.uploadedHistory : self.downloadedHistory;
  const rates = isUpload ? self.uploadRates : self.downloadRates;

  const now = Date.now();
  const bytes = isUpload ? self.uploaded : self.downloaded;
  history.push({ ts: now, value: bytes });
  const historyValue = history.shift()?.value;
  if (history.length > 1 && historyValue) {
    const start = history[0].ts;
    if (now - start > 1 * 1000) {
      // calculate a new rate and remove first entry from history
      rates.push({
        ts: now,
        value: ((bytes - historyValue) / (now - start)) * 1000
      });
      // throw out any rates that are too old to be of interest
      while (now - rates[0].ts > 10 * 1000) {
        rates.shift();
      }
      // re-calculate current upload/download rate
      calculateRate(self, kind);
    } else {
      // just want to keep the first and the last entry in history
      history.splice(1, 1);
    }
  }
}

export default Peer;
