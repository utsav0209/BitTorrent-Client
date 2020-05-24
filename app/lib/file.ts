/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'fs';
import path from 'path';
import progress from 'cli-progress';
import parseTorrent from 'parse-torrent';

const TORRENTS_PATH = './test/torrents/';
const DOWNLOADS_PATH = './test/test-downloads';

const dataSpeed: number[] = [];
const fileList: number[] = [];

const bars: any = [];

const multibar = new progress.MultiBar({
  format: ' {bar} | {name} | {size} | {speed} Kb/s',
  hideCursor: true,
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591',
  clearOnComplete: true,
  stopOnComplete: true
});

const writeBlock = (
  buffer: any,
  length: number,
  offset: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _torrent: any
): void => {
  const fileData: any = parseTorrent(
    fs.readFileSync(path.resolve(__dirname, TORRENTS_PATH, 'bop.torrent'))
  );

  let i;
  for (i = 0; i < fileData.files.length; i += 1) {
    if (
      offset < fileData.files[i].length &&
      offset >= fileData.files[i].offset
    ) {
      fs.write(fileList[i], buffer, 0, length, offset, () => {});
      dataSpeed[i] += length;
    }
  }
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const openSync = (_torrent: any): void => {
  let i;
  const fileData: any = parseTorrent(
    fs.readFileSync(path.resolve(__dirname, TORRENTS_PATH, 'bop.torrent'))
  );
  for (i = 0; i < fileData.files.length; i += 1) {
    const file = fs.openSync(
      path.resolve(__dirname, DOWNLOADS_PATH, fileData.files[i].name),
      'w'
    );
    fileList[i] = file;
    bars.push(
      multibar.create(200, 0, {
        name: fileData.files[i].name,
        size: `${fileData.files[i].length / (1024 * 1024)}Mb`,
        speed: 'NA'
      })
    );
  }
};

const speedCalculator = () => {
  setInterval(() => {
    let i = 0;
    for (i = 0; i < bars.length; i += 1) {
      bars[i].update(bars[i].increment(5), { speed: dataSpeed[i] / 1024 });
      dataSpeed[i] = 0;
    }
  }, 5000);
};

export { writeBlock, openSync, speedCalculator };
