import protocol from './protocol';
// eslint-disable-next-line import/no-cycle
import Torrent from '../torrent';

const CONNECTING = 'connecting';
const ERROR = 'error';
const STOPPED = 'stopped';
const WAITING = 'waiting';

class Tracker {
  url: URL;

  torrent: any;

  state = STOPPED;

  seeders = 0;

  leechers = 0;

  errorMessage = '';
  trackerId = '';
  timeoutId: any;

  constructor(url: string, torrent: Torrent) {
    this.url = new URL(url);
    this.torrent = torrent;
    this.state = STOPPED;
  }
  complete(cb: any) {
    this.announce('completed', cb);
  }

  start(cb: any) {
    this.announce('started', cb);
  }

  stop(cb: any) {
    this.announce('stopped', cb);
  }

  announce(event: string, cb: any) {
    const HandlerClass: any = protocol[this.url.protocol];

    if (HandlerClass) {
      const handler = new HandlerClass();
      const data = this.torrent.trackerInfo();
      this.state = CONNECTING;
      handler.handle(this, data, event, (info: any, error: Error) => {
        if (error) {
          this.state = ERROR;
          this.errorMessage = error.message;
        } else {
          if (info.trackerId) {
            this.trackerId = info.trackerId;
          }
          this.state = WAITING;
          if (event === 'started') {
            const { interval } = info;
            if (this.timeoutId) {
              clearInterval(this.timeoutId);
            }
            if (interval) {
              this.timeoutId = setInterval(() => {
                this.announce('', cb);
              }, interval * 1000);
            }
          } else if (event === 'stopped') {
            clearInterval(this.timeoutId);
            delete this.timeoutId;
            this.state = STOPPED;
          }
          if (cb) {
            cb(info);
          }
        }
      });
    }
  }
}

export default Tracker;
