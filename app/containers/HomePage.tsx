import React from 'react';
import path from 'path';

import fs from 'fs';
import ParseTorrent from 'parse-torrent';
import Home from '../components/Home';
import download from '../lib/download';
import * as torrentParser from '../lib/torrent-parser';
import Client from '../lib/client';

const TORRENTS_PATH = './test/torrents';
const DOWNLOAD_PATH = './test/test-downloads';
console.log(path.join(__dirname, TORRENTS_PATH, 'bop.torrent'));
const client = new Client({
  logLevel: 'DEBUG',
  downloadPath: path.resolve(__dirname, DOWNLOAD_PATH)
});
export default function HomePage() {
  client.addTorrent(path.resolve(__dirname, TORRENTS_PATH, 'bop.torrent'));
  return <Home />;
}
