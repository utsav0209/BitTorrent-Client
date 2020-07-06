/* eslint-disable no-empty */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-plusplus */
import log4js from 'log4js';

import net from 'net';
import Peer from './torpeer';
import Torrent from './torrent';

class Client {
  options: any;

  clientId: Buffer;
  downloadPath: string;

  torrents: Torrent[] = [];

  server: any;
  port: number;

  constructor(options: any) {
    this.options = options;

    this.server = net.createServer((stream: any) => {
      this.handleConnection(stream);
    });
    this.clientId = padClientId(options.clientId || '-NT0001-');
    this.downloadPath = options.downloadPath || '.';

    this.port = listen(
      this.server,
      options.portRangeStart || 6881,
      options.portRangeEnd || 6889
    );
  }

  // TODO: passing around clientId and port..?
  // TODO: don't pass in file, or handle multiple types, e.g. urls
  addTorrent(file: string): Torrent {
    const torrent = new Torrent(
      this.clientId,
      this.port,
      file,
      this.downloadPath
    );
    torrent.on('ready', () => {
      console.log('torrent ready');
      if (!this.torrents[torrent.torrent.infoHash]) {
        this.torrents[torrent.torrent.infoHash] = torrent;
      }
      torrent.start();
    });
    return torrent;
  }

  findTorrent(infoHash: any): Torrent {
    return this.torrents[infoHash];
  }

  handleConnection(stream: any): void {
    const peer = new Peer(stream);
    peer.once(Peer.CONNECT, (infoHash: any) => {
      const torrent = this.findTorrent(infoHash);
      if (torrent) {
        peer.setTorrent(torrent);
      } else {
        peer.disconnect('Peer attempting to download unknown torrent.');
      }
    });
  }
}

function listen(server: any, startPort: number, endPort: number) {
  let connected = false;
  let port = startPort;

  do {
    try {
      server.listen(port);
      connected = true;
      console.log('Listening for connections on %j', server.address());
    } catch (err) {}
  } while (!connected && port++ !== endPort);

  if (!connected) {
    throw new Error(
      `Could not listen on any ports in range ${startPort} - ${endPort}`
    );
  }
  return port;
}

function padClientId(clientId: string): Buffer {
  const id = Buffer.alloc(20);
  id.write(clientId, 0, 'ascii');

  const start = clientId.length;
  for (let i = start; i < 20; i++) {
    id[i] = Math.floor(Math.random() * 255);
  }
  return id;
}

export default Client;
