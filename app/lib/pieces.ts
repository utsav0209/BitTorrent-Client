import * as tp from './torrent-parser';

class Pieces {
  torrent: any;

  requested: boolean[][];

  received: boolean[][];

  constructor(torrent: any) {
    this.torrent = torrent;
    this.requested = this.buildPiecesArray();
    this.received = this.buildPiecesArray();
  }

  buildPiecesArray(): boolean[][] {
    const nPieces = this.torrent.info.pieces.length / 20;
    const arr = new Array(nPieces).fill(null);
    return arr.map((_, i) =>
      Array(tp.blocksPerPiece(this.torrent, i)).fill(false)
    );
  }

  addRequested(pieceBlock: any): void {
    const blockIndex = pieceBlock.begin / tp.BLOCK_LEN;
    this.requested[pieceBlock.index][blockIndex] = true;
  }

  addReceived(pieceBlock: any): void {
    const blockIndex = pieceBlock.begin / tp.BLOCK_LEN;
    this.received[pieceBlock.index][blockIndex] = true;
  }

  needed(pieceBlock: any): boolean {
    if (this.requested.every(blocks => blocks.every(i => i))) {
      this.requested = this.received.map(blocks => blocks.slice());
    }
    const blockIndex = pieceBlock.begin / tp.BLOCK_LEN;
    return !this.requested[pieceBlock.index][blockIndex];
  }

  isDone(): boolean {
    return this.received.every(blocks => blocks.every(i => i));
  }
}

export default Pieces;
