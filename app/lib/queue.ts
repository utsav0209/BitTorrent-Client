import * as tp from './torrent-parser';

interface Pieces {
  index: number;
  begin: number;
  length: number;
}

class Queue {
  torrent: any;

  piecesQueue: Pieces[];

  choked: boolean;

  constructor(torrent: any) {
    this.torrent = torrent;
    this.piecesQueue = [];
    this.choked = true;
  }

  queue(pieceIndex: number): void {
    const nBlocks = tp.blocksPerPiece(this.torrent, pieceIndex);
    for (let i = 0; i < nBlocks; i += 1) {
      const pieceBlock = {
        index: pieceIndex,
        begin: i * tp.BLOCK_LEN,
        length: tp.blockLen(this.torrent, pieceIndex, i)
      };
      this.piecesQueue.push(pieceBlock);
    }
  }

  deque(): Pieces | undefined {
    return this.piecesQueue.shift();
  }

  peek(): Pieces | undefined {
    return this.piecesQueue[0];
  }

  length(): number {
    return this.piecesQueue.length;
  }
}

export default Queue;
