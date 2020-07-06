/* eslint-disable @typescript-eslint/no-useless-constructor */
/* eslint-disable no-bitwise */
/* eslint-disable no-underscore-dangle */
import dgram from 'dgram';
import * as BufferUtils from '../util/bufferutil';

const CONNECTION_ID = BufferUtils.concat(
  BufferUtils.fromInt(0x417),
  BufferUtils.fromInt(0x27101980)
);

// Actions
const Action = {
  CONNECT: 0,
  ANNOUNCE: 1,
  SCRAPE: 2,
  ERROR: 3
};

class UDP {
  callback: any;
  event: any;
  connectionId: any;
  data: any;
  socket: any;
  tracker: any;
  transactionId: any;

  handle(tracker: any, data: any, event: string, callback: any): void {
    this.tracker = tracker;
    this.data = data;
    this.event = event;
    this.callback = callback;

    this.socket = dgram
      .createSocket('udp4', (msg, rinfo) => {
        this._handleMessage(msg);
      })
      .on('error', (e: Error) => {
        this._complete(null, new Error(e.message));
      });
    this._connect();
  }

  _announce(): void {
    this._generateTransactionId();
    const packet = BufferUtils.concat(
      // connection id
      this.connectionId,
      //  action
      BufferUtils.fromInt(Action.ANNOUNCE),
      //  transaction id
      this.transactionId,
      //  info hash
      this.data.info_hash,
      //  peerId
      this.data.peer_id,
      //  downloaded
      BufferUtils.fromInt(0),
      BufferUtils.fromInt(this.data.downloaded || 0), // int64, TODO: split data into two parts etc
      //  left
      BufferUtils.fromInt(0),
      BufferUtils.fromInt(this.data.left || 0), // 64
      //  uploaded
      BufferUtils.fromInt(0),
      BufferUtils.fromInt(this.data.uploaded || 0), // 64
      //  event
      BufferUtils.fromInt(this.event),
      // ip address
      BufferUtils.fromInt(0),
      // key
      BufferUtils.fromInt(Math.random() * 255),
      // num want
      BufferUtils.fromInt(200),
      // port
      BufferUtils.fromInt16(this.data.port)
    );
    this._send(packet);
  }

  _announceResponse(msg: Buffer) {
    let peersInfo: any;
    for (let i = 20; i < msg.length; i += 6) {
      const ip = `${msg[i]}.${msg[i + 1]}.${msg[i + 2]}.${msg[i + 3]}`;
      const port = (msg[i + 4] << 8) | msg[i + 5];
      peersInfo.push({
        ip,
        port
      });
    }
    const trackerInfo = {
      interval: BufferUtils.readInt(msg, 8),
      leechers: BufferUtils.readInt(msg, 12),
      seeders: BufferUtils.readInt(msg, 16),
      peers: peersInfo
    };

    this._complete(trackerInfo);
  }

  _complete(trackerInfo: any, err?: Error): void {
    try {
      this.socket.close();
    } catch (e) {
      // @TODO: Handle error
    }
    this.callback(trackerInfo, err);
  }

  _connect(): void {
    this._generateTransactionId();
    const packet = BufferUtils.concat(
      CONNECTION_ID,
      BufferUtils.fromInt(Action.CONNECT),
      this.transactionId
    );
    this._send(packet);
  }

  _generateTransactionId(): void {
    const id = Buffer.alloc(4);
    id[0] = Math.random() * 255;
    id[1] = Math.random() * 255;
    id[2] = Math.random() * 255;
    id[3] = Math.random() * 255;
    this.transactionId = id;
  }

  _handleMessage(msg: Buffer): void {
    const action = BufferUtils.readInt(msg);
    const responseTransactionId = BufferUtils.slice(msg, 4, 8);
    console.log(responseTransactionId, this.transactionId);
    if (BufferUtils.equal(responseTransactionId, this.transactionId)) {
      switch (action) {
        case Action.CONNECT:
          this.connectionId = BufferUtils.slice(msg, 8, 16);
          this._announce();
          break;
        case Action.ANNOUNCE:
          this._announceResponse(msg);
          break;
        case Action.SCRAPE:
          break;
        case Action.ERROR: {
          const message = BufferUtils.slice(msg, 8, msg.length);
          this._complete(null, new Error(message.toString('utf8')));
          break;
        }
        default:
      }
    } else {
      this._complete(
        null,
        new Error('Received invalid transactionId from server.')
      );
    }
  }

  _send(packet: Buffer): void {
    this.socket.send(
      packet,
      0,
      packet.length,
      this.tracker.url.port,
      this.tracker.url.hostname,
      (err: Error) => {
        if (err) {
          this._complete(null, err);
        }
      }
    );
  }
}

export default UDP;
