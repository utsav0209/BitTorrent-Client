import React from 'react';
import path from 'path';

import Home from '../components/Home';
import download from '../lib/download';
import * as torrentParser from '../lib/torrent-parser';

const TORRENTS_PATH = './test/torrents';
console.log(path.join(__dirname, TORRENTS_PATH, 'bop.torrent'));
const torrent = torrentParser.open(
  path.resolve(__dirname, TORRENTS_PATH, 'bop.torrent')
);

export default function HomePage() {
  download(torrent);
  return <Home />;
}
